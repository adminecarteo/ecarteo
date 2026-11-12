# Report export and writing systems

Report headings and controls remain French/English. Audit observations may contain other writing systems; they must not silently disappear from an export.

## Available export paths

- **French/English and Latin text:** the existing direct PDF download, using the renderer's built-in Helvetica faces.
- **Chinese text:** direct PDF export adds a locally hosted static font, Ecarteo Han, derived from Noto Sans SC. It is loaded only when Han/Kana characters occur in report data, including evidence, names and dated supplements. French accents remain in the original Latin faces.
- **Arabic text:** the download action prepares an explicit **Open printable report** button. It opens a local, read-only window. After the bundled Amiri font loads, choose **Print / Save as PDF**, then select the browser's PDF destination. Report text never appears in the URL, and no external font/content service receives it. The print window has no opener reference and a restrictive content-security policy; every report field is escaped as plain text.

Arabic goes through browser shaping because the installed `@react-pdf/renderer` produced corrupt Arabic Unicode maps in an actual font proof. Rendering without a font is not a valid workaround. The export function refuses that native path instead of producing a silently damaged file. The fallback preserves the visual Arabic text in the tested Chromium output. PDF text extraction and search behavior vary by viewer: some extractors return RTL words in visual order. **Copy report text** in the application remains the reliable way to obtain the original logical Unicode text. No universal RTL extraction, Korean font coverage, PDF/UA certification, or fully localized Arabic interface is claimed.

## Fonts shipped with the application

All assets are in `public/fonts/reports/`; their source licenses are shipped beside them. They are static TTF files, not variable-font data embedded into a PDF.

| Asset                    | Upstream source/version     | Modification                                                                                          | SHA-256                                                            |
| ------------------------ | --------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `EcarteoHan-Regular.ttf` | Noto Sans SC, version 2.004 | Instantiated at weight 400 with fonttools 4.68.0; family/style names changed to Ecarteo Han / Regular | `54a3f8e684fe5fc09efb82f9a35e07697d649166667baff2f5fcfabcca75d938` |
| `Amiri-Regular.ttf`      | Amiri 1.003                 | Unmodified                                                                                            | `2444788b85996d795f0db7e14f3f6bfc3ea1c985e391267db0269b9e40f3447d` |

Sources retrieved during development:

- [Noto Sans SC variable TTF](https://github.com/notofonts/noto-cjk/blob/main/Sans/Variable/TTF/Subset/NotoSansSC-VF.ttf). Input SHA-256: `d68bafcb48a2707749396aa12bbbd833cb70401f3a9a689fd2902c7e0d295964`. License: [SIL OFL](https://github.com/notofonts/noto-cjk/blob/main/Sans/LICENSE), saved as `OFL-CJK.txt`.
- [Amiri Regular](https://github.com/aliftype/amiri/blob/main/fonts/Amiri-Regular.ttf). License: [SIL OFL](https://github.com/aliftype/amiri/blob/main/OFL.txt), saved as `OFL-Amiri.txt`.

The CJK asset is approximately 10 MB and the Arabic asset approximately 600 KB. Ordinary Latin PDF downloads do not load either. Browser-print Unicode ranges keep the Arabic and Han fonts separate from Latin text. The Docker runner and standalone startup must copy the `public/` directory; the deployment smoke check should fetch both font URLs successfully.

To reproduce the static CJK transformation from the verified upstream input, use an isolated Python environment with `fonttools==4.68.0`:

```python
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

font = instantiateVariableFont(TTFont("NotoSansSC-VF.ttf"), {"wght": 400}, inplace=True)
labels = {
    1: "Ecarteo Han", 2: "Regular", 4: "Ecarteo Han Regular",
    6: "EcarteoHan-Regular", 16: "Ecarteo Han", 17: "Regular",
}
for record in font["name"].names:
    if record.nameID in labels:
        record.string = labels[record.nameID].encode(record.getEncoding())
font["OS/2"].usWeightClass = 400
font.save("EcarteoHan-Regular.ttf")
```

Font build timestamps may change the binary hash when regenerating; retain the bundled reviewed artifact unless intentionally updating it and repeating visual/text verification.

## Verification

- Unit tests exercise the actual PDF renderer for Latin and Chinese, verify embedded Chinese Unicode mappings, and verify Arabic native export is blocked.
- Escaping tests put markup-like text in names, titles and supplements and verify that printable output contains no injected scripts/images.
- Chromium tests render Arabic plus Chinese at desktop and 390px mobile widths, check RTL direction, inspect local font loading, generate a PDF and check for external requests or runtime errors.
- A separate local server test executes the real popup helper and proves the print button becomes available only after fonts load, the window URL contains no report data, the opener is cleared, and the button calls browser printing.
- The generated samples were visually inspected. This is local component/export testing, not a live Supabase report workflow or a guarantee for every PDF viewer.

Reference: the renderer's [font guidance](https://github.com/diegomura/react-pdf-site/blob/master/docs/fonts.md) and its [Arabic text-layer issue](https://github.com/diegomura/react-pdf/issues/3533) explain why adding a font alone cannot establish Arabic native-PDF fidelity.
