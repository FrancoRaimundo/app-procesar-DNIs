# DNI → PDF (Local Web App)

Aplicación web **100% local** (sin back-end) para procesar imágenes de DNI (frente y dorso) y generar PDFs en lote, con un **reporte** y un **ZIP** descargable.

La app está pensada para escenarios reales donde recibís muchas fotos de DNIs (por ejemplo, altas de participantes, trámites internos, carga en sistemas, armado de legajos) y necesitás:

- **Estandarizar** el formato
- **Detectar problemas** (faltantes / duplicados / nombres mal formateados)
- **Generar salida lista para usar** (PDFs + reporte)

---

## ¿Qué hace?

1. **Selecciona una carpeta** con imágenes (funciona mejor en Chrome/Edge).
2. **Detecta pares** por ID:
   - `123_FRENTE.jpg`
   - `123_DORSO.png`
   - Soporta duplicados: `123_FRENTE(1).jpg`, `123_DORSO(2).jpeg`
3. Clasifica cada ID en:
   - ✅ **Listo**: hay 1 frente y 1 dorso
   - ⚠️ **Faltante**: falta frente o falta dorso
   - ❌ **Duplicado**: hay más de un frente y/o más de un dorso
4. Permite **elegir cuál imagen usar** cuando hay duplicados.
5. Genera PDFs en lote:
   - **Modo 1 página**: frente arriba / dorso abajo (A4)
   - **Modo 2 páginas**: frente en página 1 / dorso en página 2 (A4)
6. Empaqueta todo en un **ZIP** descargable:
   - `pdfs/123.pdf`, `pdfs/124.pdf`, ...
   - `reporte.csv` con estado por ID

---

## ¿Por qué existe esta app?

Porque cuando trabajás con muchos DNIs, suelen aparecer estos problemas:

- La gente manda imágenes con nombres inconsistentes.
- Hay fotos repetidas (ej. `FRENTE(1)`).
- Faltan frentes o dorsos (y no se puede completar un formulario sin eso).
- Hacerlo manualmente consume tiempo y genera errores.

La app automatiza ese trabajo y deja una salida organizada para poder continuar el flujo (subir a un sistema, archivar, etc.).

---

## Principios de diseño

- **Privacidad primero:** todo ocurre en el navegador del usuario.
- **Sin servidores / sin base de datos:** no se suben DNIs a ningún lado.
- **Portabilidad:** se puede hostear como sitio estático (Netlify, GitHub Pages, Cloudflare Pages, Firebase Hosting, etc.).
- **Trazabilidad:** reporte CSV para auditoría y revisión.

---

## Requisitos

- Navegador recomendado: **Chrome** o **Edge** (por soporte de selección de carpeta con `webkitdirectory`).
- Conexión a internet: solo para cargar librerías desde CDN (pdf-lib y jszip).  
  > Si querés modo offline, se pueden “vendorizar” esas librerías en el repo.

---

## Estructura del proyecto

/
├─ index.html
├─ styles.css
└─ app.js


---

## Convención de nombres de archivos

La app reconoce únicamente imágenes con este patrón:

- `{ID}_FRENTE.jpg|jpeg|png`
- `{ID}_DORSO.jpg|jpeg|png`

Soporta duplicados:

- `{ID}_FRENTE(1).jpg`
- `{ID}_DORSO(2).png`

Ejemplos válidos:

- `123_FRENTE.jpg`
- `123_DORSO.png`
- `126_FRENTE(1).jpg`
- `126_DORSO(2).jpeg`

Todo archivo que no cumpla el patrón se marca como **ignorado**.

---

## Cómo usar

1. Abrí la app en el navegador.
2. Click en **Seleccionar carpeta**.
3. Elegí la carpeta donde están las imágenes.
4. Revisá la tabla:
   - si hay duplicados, elegí desde los dropdowns cuál usar
   - si hay faltantes, esos IDs quedarán en estado “omitido”
5. Elegí:
   - **Modo PDF** (1 o 2 páginas)
   - **Ajuste imagen**:
     - *Contener*: no recorta, puede dejar márgenes
     - *Cubrir*: llena el área y recorta bordes (centrado)
   - **Concurrencia**: cuántos IDs se procesan en paralelo (2–4)
6. Click en **Generar PDFs**.
7. Click en **Descargar ZIP**.

---

## ¿Qué significa “Concurrencia”?

Es la cantidad de PDFs que se generan **en paralelo**:

- Concurrencia 1: procesa 1 por vez (más lento pero más liviano)
- Concurrencia 3: procesa hasta 3 a la vez (más rápido, más RAM/CPU)

Recomendación:
- PC normal: **3**
- Si se pone pesado: **2**
- PC potente: **4**

---

## Salida generada

El ZIP contiene:

resultado_pdfs_YYYY-MM-DD_HHMM.zip
├─ pdfs/
│ ├─ 123.pdf
│ ├─ 124.pdf
│ └─ ...
└─ reporte.csv


`reporte.csv` incluye columnas:

- `ID`
- `Estado` (`success`, `error`, `skipped`)
- `Mensaje` (detalle)

---

## Limitaciones conocidas

- En móviles, el selector de **carpeta** puede no estar disponible.  
  (Se puede agregar un modo alternativo “seleccionar múltiples imágenes”.)
- Si las fotos tienen proporciones muy distintas, el modo *Cubrir* puede recortar bordes relevantes.
- El procesamiento en el navegador depende del hardware disponible.

---


## Seguridad y privacidad

- No hay back-end.
- No se suben imágenes.
- Los archivos se procesan localmente y el usuario descarga el resultado.

---


## Licencia

Uso libre para fines personales/educativos.
