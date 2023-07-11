"use strict";

/*
 * Page loaded:
 * - initialize user-selectable parameters
 */
function onBodyLoad() {
  addInchiVersionsToSelect("inchi-tab1-inchiversion");
  addInchiOptions("inchi-tab1-options", () => updateInchiTab1());

  addInchiVersionsToSelect("inchi-tab2-inchiversion");
  addInchiOptions("inchi-tab2-options", () => updateInchiTab2());

  addInchiVersionsToSelect("inchi-tab3-inchiversion");
}

function addInchiVersionsToSelect(selectId) {
  availableInchiVersions.forEach(v => {
    const option = document.createElement("option");
    option.innerHTML = v;
    option.value = v;
    document.getElementById(selectId).appendChild(option);
  });
}

function addInchiOptions(targetDivId, updateFunction) {
  const template = document.getElementById("inchiOptionsTemplate");
  const clone = template.content.cloneNode(true);

  /*
   * Reassign the name of the "stereoRadio" radio button group.
   */
  clone.querySelectorAll("input.form-check-input[type=\"radio\"][name=\"stereoRadio\"]").forEach(input => {
    input.name = "stereoRadio-" + targetDivId;
  });

  /*
   * Register an on-change event on the "Include Stereo" checkbox to switch the
   * 'disabled' state of the inputs that cope with stereo options.
   */
  clone.getElementById("includeStereo").addEventListener("change", function() {
    document.getElementById(targetDivId).querySelectorAll("input.form-check-input[data-inchi-stereo-option]").forEach(input => {
      input.disabled = !this.checked;
    });
  });

  /*
   * Reassign ids of all <input> elements and change the target id of their
   * <label> element accordingly. Also register an on-change event to call
   * updateFunction.
   */
  clone.querySelectorAll("input.form-check-input").forEach(input => {
    const newId = input.id + "-" + targetDivId;
    input.id = newId;
    input.nextElementSibling.htmlFor = newId;

    input.addEventListener("change", updateFunction);
  });

  document.getElementById(targetDivId).appendChild(clone);
}

/*
 * Update actions (when user changes inputs)
 */
async function updateInchiTab1() {
  // clear output fields
  writeResult("", "inchi-tab1-inchi", "inchi-tab1-inchikey", "inchi-tab1-auxinfo", "inchi-tab1-logs");

  // collect user input
  let molfile;
  const ketcher = getKetcher("inchi-tab1-ketcher");
  if (ketcher.containsReaction()) {
    writeResult("Cannot convert reactions to InChI", "inchi-tab1-logs");
    return;
  } else if (ketcher.editor.struct().isBlank()) {
    // no structure
    return;
  } else {
    molfile = await ketcher.getMolfile();
  }
  const options = collectInchiOptions("inchi-tab1-options");
  const inchiVersion = document.getElementById("inchi-tab1-inchiversion").value;

  // run conversion
  await convertMolfileToInchiAndWriteResults(molfile, options, inchiVersion, "inchi-tab1-inchi", "inchi-tab1-inchikey", "inchi-tab1-auxinfo", "inchi-tab1-logs");
}

async function updateInchiTab2() {
  // clear output fields
  writeResult("", "inchi-tab2-inchi", "inchi-tab2-inchikey", "inchi-tab2-auxinfo", "inchi-tab2-logs");

  // collect user input
  const molfile = document.getElementById("inchi-tab2-molfileTextarea").value;
  const options = collectInchiOptions("inchi-tab2-options");
  const inchiVersion = document.getElementById("inchi-tab2-inchiversion").value;

  // run conversion
  await convertMolfileToInchiAndWriteResults(molfile, options, inchiVersion, "inchi-tab2-inchi", "inchi-tab2-inchikey", "inchi-tab2-auxinfo", "inchi-tab2-logs");
}

async function convertMolfileToInchiAndWriteResults(molfile, options, inchiVersion, inchiTextElementId, inchikeyTextElementId, auxinfoTextElementId, logTextElementId) {
  const log = [];
  log.push("InChI options: " + options);

  let inchiResult;
  try {
    inchiResult = await inchiFromMolfile(molfile, options, inchiVersion);
  } catch(e) {
    writeResult(e, logTextElementId);
    return;
  }
  writeResult(inchiResult.inchi, inchiTextElementId);
  writeResult(inchiResult.auxinfo, auxinfoTextElementId);

  if (inchiResult.log !== "") {
    log.push(inchiResult.log);
  }

  if ((inchiResult.return_code != -1) && (inchiResult.inchi !== "")) {
    let inchikeyResult;
    try {
      inchikeyResult = await inchikeyFromInchi(inchiResult.inchi, inchiVersion);
    } catch(e) {
      log.push(e);
    }
    writeResult(inchikeyResult.inchikey, inchikeyTextElementId);

    if ((inchikeyResult == -1) && (inchikeyResult.message !== "")) {
      log.push(inchikeyResult.message);
    }
  }

  writeResult(log.join("\n"), logTextElementId);
}

function collectInchiOptions(tabOptionsId) {
  const options = [];

  document.getElementById(tabOptionsId)
    .querySelectorAll("input.form-check-input:enabled[data-inchi-option-on]:checked")
    .forEach(input => {
      options.push(input.dataset.inchiOptionOn);
    }
  );

  document.getElementById(tabOptionsId)
    .querySelectorAll("input.form-check-input:enabled[data-inchi-option-off]:not(:checked)")
    .forEach(input => {
      options.push(input.dataset.inchiOptionOff);
    }
  );

  return options.map(o => "-" + o).join(" ");
}

function writeResult(text, ...ids) {
  for (let id of ids) {
    document.getElementById(id).innerHTML = text;
  }
}

async function updateInchiTab3() {
  const inchi = document.getElementById("inchi-tab3-inchiTextarea").value.trim();
  const inchiVersion = document.getElementById("inchi-tab3-inchiversion").value;
  const ketcher = getKetcher("inchi-tab3-ketcher");
  const logTextElementId = "inchi-tab3-logs";

  // clear outputs
  ketcher.editor.clear()
  writeResult("", logTextElementId);

  if ((inchi !== "") && (!inchi.startsWith("InChI="))) {
    writeResult("The InChI string should start with \"InChI=\".", logTextElementId);
    return;
  }

  // run conversion
  let molfileResult;
  try {
    molfileResult = await molfileFromInchi(inchi, "", inchiVersion);
  } catch(e) {
    writeResult(e, logTextElementId);
    return;
  }
  const molfile = molfileResult.molfile;
  if (molfile !== "") {
    await ketcher.setMolecule(molfile);
    await ketcher.layout();
  }

  const log = [];
  if (molfileResult.log !== "") {
    log.push(molfileResult.log);
  }
  writeResult(log.join("\n"), logTextElementId);
}

/*
 * Ketcher
 */
function getKetcher(iframeId) {
  return document.getElementById(iframeId).contentWindow.ketcher;
}

function onKetcherLoaded(iframeId, updateFunction) {
  const ketcher = getKetcher(iframeId);

  // Chrome fires the onload event too early, so we have to wait until 'ketcher' exists.
  if (ketcher) {
    ketcher.editor.subscribe("change", updateFunction);
  } else {
    setTimeout(() => onKetcherLoaded(iframeId, updateFunction), 0);
  }
}

/*
 * Drag-and-drop into the Molfile textarea
 */
function onTextareaDragover(event) {
  event.stopPropagation();
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
}

async function onMolfileTextareaDrop(event) {
  event.stopPropagation();
  event.preventDefault();

  const content = await extractContent(event.dataTransfer);
  if (!content) {
    return;
  }

  document.getElementById("inchi-tab2-molfileTextarea").value = content;
  await updateInchiTab2();
}

async function extractContent(dataTransfer) {
  const items = dataTransfer.items;
  if (!items || items.length == 0) {
    return null;
  }
  const item = items[0];

  if (item.kind === "file") {
    return await item.getAsFile().text();
  } else if (item.kind === "string") {
    return new Promise(resolve => {
      item.getAsString(data => resolve(data));
    });
  }
  return null;
}
