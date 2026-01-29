/* global PDFLib, JSZip */

(function () {
  // ======= DOM =======
  const btnPickFolder = document.getElementById("btnPickFolder");
  const btnReset = document.getElementById("btnReset");
  const folderInput = document.getElementById("folderInput");

  const pdfModeEl = document.getElementById("pdfMode");
  const fitModeEl = document.getElementById("fitMode");
  const concurrencyEl = document.getElementById("concurrency");
  const processDuplicatesEl = document.getElementById("processDuplicates");

  const btnGenerate = document.getElementById("btnGenerate");
  const btnDownloadZip = document.getElementById("btnDownloadZip");

  const kpiTotal = document.getElementById("kpiTotal");
  const kpiReady = document.getElementById("kpiReady");
  const kpiMissing = document.getElementById("kpiMissing");
  const kpiDup = document.getElementById("kpiDup");
  const kpiIgnored = document.getElementById("kpiIgnored");

  const progressText = document.getElementById("progressText");
  const progressPct = document.getElementById("progressPct");
  const progressBar = document.getElementById("progressBar");

  const pairsTbody = document.getElementById("pairsTbody");
  const logEl = document.getElementById("log");

  const browserNote = document.getElementById("browserNote");

  // ======= Estado =======
  /**
   * Pair:
   * {
   *   id: string,
   *   fronts: FileInfo[],
   *   backs: FileInfo[],
   *   pickFront: number,
   *   pickBack: number,
   *   status: "ready"|"missing"|"duplicate",
   *   message: string
   * }
   */
  let pairs = [];
  let ignoredCount = 0;

  /** ZIP listo para descargar */
  let zipBlob = null;
  let zipName = null;

  // Regex: acepta duplicados tipo (1)
  const NAME_RE = /^(\d+)_(FRENTE|DORSO)(?:\(\d+\))?\.(jpg|jpeg|png)$/i;

  // ======= Util =======
  function log(msg) {
    const t = new Date().toLocaleTimeString();
    logEl.textContent += `[${t}] ${msg}\n`;
    logEl.scrollTop = logEl.scrollHeight;
  }

  function setProgress(current, total) {
    const pct = total === 0 ? 0 : Math.round((current / total) * 100);
    progressPct.textContent = `${pct}%`;
    progressBar.style.width = `${pct}%`;
  }

  function setProgressText(text) {
    progressText.textContent = text;
  }

  function pad2(n) { return String(n).padStart(2, "0"); }

  function makeTimestamp() {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}_${pad2(d.getHours())}${pad2(d.getMinutes())}`;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function fileToArrayBuffer(file) {
    return file.arrayBuffer();
  }

  function parseName(fileName) {
    const m = fileName.match(NAME_RE);
    if (!m) return null;
    return { id: m[1], side: m[2].toUpperCase() };
  }

  function summarize() {
    const total = pairs.length;
    const ready = pairs.filter(p => p.status === "ready").length;
    const missing = pairs.filter(p => p.status === "missing").length;
    const dup = pairs.filter(p => p.status === "duplicate").length;

    kpiTotal.textContent = total;
    kpiReady.textContent = ready;
    kpiMissing.textContent = missing;
    kpiDup.textContent = dup;
    kpiIgnored.textContent = ignoredCount;

    // habilitación de botones
    btnGenerate.disabled = total === 0;
    btnReset.disabled = total === 0;

    // ZIP solo si existe
    btnDownloadZip.disabled = !zipBlob;
  }

  function sortByNumericId(a, b) {
    return Number(a.id) - Number(b.id);
  }

  function buildPairsFromFiles(files) {
    ignoredCount = 0;
    const map = new Map(); // id -> { fronts: [], backs: [] }

    for (const f of files) {
      const parsed = parseName(f.name);
      if (!parsed) {
        ignoredCount++;
        continue;
      }
      const id = parsed.id;
      const side = parsed.side;

      if (!map.has(id)) map.set(id, { fronts: [], backs: [] });
      const entry = map.get(id);

      const info = { file: f, name: f.name, id, side };

      if (side === "FRENTE") entry.fronts.push(info);
      else entry.backs.push(info);
    }

    const out = [];
    for (const [id, entry] of map.entries()) {
      const fronts = entry.fronts;
      const backs = entry.backs;

      let status = "ready";
      let message = "Listo para generar";

      if (fronts.length === 0 || backs.length === 0) {
        status = "missing";
        message = fronts.length === 0 ? "Falta FRENTE" : "Falta DORSO";
      } else if (fronts.length > 1 || backs.length > 1) {
        status = "duplicate";
        message = `Duplicados: frente(${fronts.length}) dorso(${backs.length})`;
      }

      out.push({
        id,
        fronts,
        backs,
        pickFront: 0,
        pickBack: 0,
        status,
        message
      });
    }

    out.sort(sortByNumericId);
    return out;
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function renderTable() {
    if (pairs.length === 0) {
      pairsTbody.innerHTML = `<tr><td colspan="4" class="muted">Todavía no seleccionaste una carpeta.</td></tr>`;
      return;
    }

    const processDup = processDuplicatesEl.checked;

    const rows = pairs.map((p, idx) => {
      const rowClass =
        p.status === "ready" ? "row-ready" :
        p.status === "missing" ? "row-missing" :
        "row-dup";

      const frontCell = renderFileCell(p, idx, "FRENTE", processDup);
      const backCell  = renderFileCell(p, idx, "DORSO", processDup);

      return `
        <tr class="${rowClass}">
          <td><strong>${escapeHtml(p.id)}</strong></td>
          <td>${frontCell}</td>
          <td>${backCell}</td>
          <td>
            <div><strong>${escapeHtml(p.message)}</strong></div>
            <div class="small">
              ${p.status === "duplicate"
                ? (processDup ? "Se procesará usando la selección elegida." : "Por defecto se omitirá (activá 'Procesar duplicados').")
                : (p.status === "missing" ? "Se omitirá del procesamiento." : "OK")}
            </div>
          </td>
        </tr>
      `;
    }).join("");

    pairsTbody.innerHTML = rows;

    // enganchar handlers de selects
    for (let i = 0; i < pairs.length; i++) {
      const fSel = document.getElementById(`frontSel_${i}`);
      const bSel = document.getElementById(`backSel_${i}`);
      if (fSel) {
        fSel.addEventListener("change", (e) => {
          pairs[i].pickFront = Number(e.target.value);
          zipBlob = null;
          zipName = null;
          summarize();
        });
      }
      if (bSel) {
        bSel.addEventListener("change", (e) => {
          pairs[i].pickBack = Number(e.target.value);
          zipBlob = null;
          zipName = null;
          summarize();
        });
      }
    }
  }

  function renderFileCell(pair, rowIndex, side, processDup) {
    const isFront = side === "FRENTE";
    const arr = isFront ? pair.fronts : pair.backs;

    if (arr.length === 0) return `<span class="muted">-</span>`;

    // si no es duplicado, mostramos el único nombre
    const isDupSide = arr.length > 1;

    if (!isDupSide) {
      return `<span title="${escapeHtml(arr[0].name)}">${escapeHtml(arr[0].name)}</span>`;
    }

    // si hay duplicados, mostramos select (siempre visible) para que elijas
    const selectId = isFront ? `frontSel_${rowIndex}` : `backSel_${rowIndex}`;
    const selectedIdx = isFront ? pair.pickFront : pair.pickBack;

    const options = arr.map((fi, i) => {
      const sel = i === selectedIdx ? "selected" : "";
      return `<option value="${i}" ${sel}>${escapeHtml(fi.name)}</option>`;
    }).join("");

    return `
      <div>
        <select id="${selectId}" class="select-inline">
          ${options}
        </select>
        <div class="small">${processDup ? "Seleccionado para procesar." : "Seleccioná cuál usar (si activás 'Procesar duplicados')."}</div>
      </div>
    `;
  }

  // ======= PDF =======
  const A4 = { w: 595.28, h: 841.89 };

  function drawFittedImage(page, img, box, fitMode) {
    // box: {x,y,w,h}
    const sx = box.w / img.width;
    const sy = box.h / img.height;
    const scale = (fitMode === "contain") ? Math.min(sx, sy) : Math.max(sx, sy);

    const w = img.width * scale;
    const h = img.height * scale;
    const x = box.x + (box.w - w) / 2;
    const y = box.y + (box.h - h) / 2;

    if (fitMode === "cover") {
      // Clipping para evitar que invada fuera del box
      const {
        pushGraphicsState, popGraphicsState,
        clip, endPath,
        moveTo, lineTo, closePath
      } = PDFLib;

      page.pushOperators(
        pushGraphicsState(),
        moveTo(box.x, box.y),
        lineTo(box.x + box.w, box.y),
        lineTo(box.x + box.w, box.y + box.h),
        lineTo(box.x, box.y + box.h),
        closePath(),
        clip(),
        endPath()
      );
      page.drawImage(img, { x, y, width: w, height: h });
      page.pushOperators(popGraphicsState());
      return;
    }

    // contain
    page.drawImage(img, { x, y, width: w, height: h });
  }

  async function generatePdfBytes(pair, pdfMode, fitMode) {
    const { PDFDocument } = PDFLib;
    const margin = 20;

    const frontInfo = pair.fronts[pair.pickFront];
    const backInfo  = pair.backs[pair.pickBack];

    const doc = await PDFDocument.create();

    const frontBuf = await fileToArrayBuffer(frontInfo.file);
    const backBuf  = await fileToArrayBuffer(backInfo.file);

    const frontExt = frontInfo.name.toLowerCase().split(".").pop();
    const backExt  = backInfo.name.toLowerCase().split(".").pop();

    const frontImg = (frontExt === "png") ? await doc.embedPng(frontBuf) : await doc.embedJpg(frontBuf);
    const backImg  = (backExt === "png")  ? await doc.embedPng(backBuf)  : await doc.embedJpg(backBuf);

    if (pdfMode === "single") {
      const page = doc.addPage([A4.w, A4.h]);
      const half = A4.h / 2;

      const topBox = { x: margin, y: half + margin, w: A4.w - 2 * margin, h: half - 2 * margin };
      const botBox = { x: margin, y: margin,         w: A4.w - 2 * margin, h: half - 2 * margin };

      drawFittedImage(page, frontImg, topBox, fitMode);
      drawFittedImage(page, backImg,  botBox, fitMode);
    } else {
      const page1 = doc.addPage([A4.w, A4.h]);
      drawFittedImage(page1, frontImg, { x: margin, y: margin, w: A4.w - 2 * margin, h: A4.h - 2 * margin }, fitMode);

      const page2 = doc.addPage([A4.w, A4.h]);
      drawFittedImage(page2, backImg, { x: margin, y: margin, w: A4.w - 2 * margin, h: A4.h - 2 * margin }, fitMode);
    }

    return await doc.save(); // Uint8Array
  }

  // ======= Concurrencia =======
  async function asyncPool(limit, array, iteratorFn) {
    const ret = [];
    const executing = [];
    for (const item of array) {
      const p = Promise.resolve().then(() => iteratorFn(item));
      ret.push(p);

      if (limit <= array.length) {
        const e = p.then(() => executing.splice(executing.indexOf(e), 1));
        executing.push(e);
        if (executing.length >= limit) {
          await Promise.race(executing);
        }
      }
    }
    return Promise.all(ret);
  }

  // ======= Generación ZIP =======
  async function generateAll() {
    zipBlob = null;
    zipName = null;
    btnDownloadZip.disabled = true;

    const pdfMode = pdfModeEl.value;    // "single"|"double"
    const fitMode = fitModeEl.value;    // "contain"|"cover"
    const concurrency = Number(concurrencyEl.value) || 3;
    const processDup = processDuplicatesEl.checked;

    // Elegibles:
    // - ready: siempre
    // - duplicate: solo si processDup y tiene al menos 1 frente y 1 dorso
    const eligible = pairs.filter(p => {
      if (p.status === "ready") return true;
      if (p.status === "duplicate") return processDup && p.fronts.length > 0 && p.backs.length > 0;
      return false; // missing
    });

    if (eligible.length === 0) {
      log("No hay pares elegibles para procesar (revisá faltantes/duplicados).");
      return;
    }

    btnGenerate.disabled = true;
    setProgressText("Generando PDFs…");
    setProgress(0, eligible.length);
    log(`Procesando ${eligible.length} IDs (modo=${pdfMode}, ajuste=${fitMode}, concurrencia=${concurrency})…`);

    const zip = new JSZip();
    const pdfFolder = zip.folder("pdfs");

    const reportRows = [];
    let done = 0;

    // procesador por item
    async function processPair(p) {
      try {
        const bytes = await generatePdfBytes(p, pdfMode, fitMode);
        pdfFolder.file(`${p.id}.pdf`, bytes);
        reportRows.push({ id: p.id, status: "success", message: "PDF generado" });
        log(`OK  - ${p.id}.pdf`);
      } catch (err) {
        const msg = (err && err.message) ? err.message : String(err);
        reportRows.push({ id: p.id, status: "error", message: msg });
        log(`ERR - ${p.id} → ${msg}`);
      } finally {
        done++;
        setProgress(done, eligible.length);
        setProgressText(`Generando PDFs… (${done}/${eligible.length})`);
      }
    }

    // Ejecutar con pool
    await asyncPool(concurrency, eligible, processPair);

    // Agregar filas de omitidos (faltantes / duplicados no procesados)
    for (const p of pairs) {
      if (eligible.includes(p)) continue;
      reportRows.push({ id: p.id, status: "skipped", message: p.message });
    }

    // CSV
    const csvLines = [
      "ID,Estado,Mensaje",
      ...reportRows.map(r => `${r.id},${r.status},"${String(r.message).replace(/"/g, '""')}"`)
    ];
    zip.file("reporte.csv", csvLines.join("\n"));

    setProgressText("Empaquetando ZIP…");
    log("Empaquetando ZIP…");

    const blob = await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 }
    });

    zipBlob = blob;
    zipName = `resultado_pdfs_${makeTimestamp()}.zip`;

    btnDownloadZip.disabled = false;
    setProgressText("Listo. ZIP generado.");
    log(`ZIP listo: ${zipName}`);

    btnGenerate.disabled = false;
    summarize();
  }

  // ======= Eventos =======
  btnPickFolder.addEventListener("click", () => folderInput.click());

  folderInput.addEventListener("change", () => {
    const files = Array.from(folderInput.files || []);
    zipBlob = null;
    zipName = null;
    btnDownloadZip.disabled = true;

    if (files.length === 0) return;

    pairs = buildPairsFromFiles(files);

    logEl.textContent = "";
    log(`Carpeta cargada: ${files.length} archivos detectados.`);
    log(`Ignorados por nombre no válido: ${ignoredCount}.`);

    setProgressText("Sin procesar");
    setProgress(0, 1);

    summarize();
    renderTable();

    // habilitar reset
    btnReset.disabled = false;
  });

  btnReset.addEventListener("click", () => {
    pairs = [];
    ignoredCount = 0;
    zipBlob = null;
    zipName = null;
    folderInput.value = "";

    logEl.textContent = "";
    setProgressText("Sin procesar");
    setProgress(0, 1);

    summarize();
    renderTable();
  });

  btnGenerate.addEventListener("click", async () => {
    try {
      await generateAll();
    } catch (e) {
      log(`Error general: ${e && e.message ? e.message : String(e)}`);
      btnGenerate.disabled = false;
    }
  });

  btnDownloadZip.addEventListener("click", () => {
    if (!zipBlob || !zipName) return;
    downloadBlob(zipBlob, zipName);
  });

  processDuplicatesEl.addEventListener("change", () => {
    zipBlob = null;
    zipName = null;
    summarize();
    renderTable();
  });

  // Nota de compatibilidad
  // (webkitdirectory funciona principalmente en Chromium)
  const isChromium = !!window.chrome;
  if (!isChromium) browserNote.hidden = false;

  // init
  summarize();
  renderTable();
})();
