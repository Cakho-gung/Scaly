# CLAUDE.md — Scaly

Figma plugin sinh **atomic variables** cho Figma. Hai màn: **Color** (đã xong) và **Typography** (đang build).

---

## 1. Chạy & build

```bash
npm run dev      # vite dev server, http://localhost:5173 (test UI ngoài Figma)
npm run build    # vite build + tsc → dist/index.html (UI) + dist/code.js (backend)
npm run lint
```

Load plugin vào Figma: **Plugins → Development → Import plugin from manifest** → chọn `manifest.json`.

Chạy dev server ngoài Figma vẫn render được UI; các lệnh gọi `parent.postMessage` sẽ không có phản hồi nên code phải **luôn có fallback** (xem `MOCK_FONTS`, `MOCK_WEIGHTS`).

---

## 2. Kiến trúc

```
manifest.json          → main: dist/code.js · ui: dist/index.html
code.ts                → BACKEND (Figma sandbox). Nhận message, gọi figma.*
src/App.tsx            → UI gốc: header, tab Color/Typography, toàn bộ màn Color
src/typo/              → TOÀN BỘ màn Typography
  types.ts             → mô hình dữ liệu
  logic.ts             → hàm thuần (size/order/round/insert) + defaults + mock
  ui.tsx               → primitives dùng chung (Dropdown, FontPicker, EditableField…)
  icons.tsx            → icon inline (KHÔNG dùng lucide-react: bản pin 1.16 thiếu export)
  TypoApp.tsx          → orchestrator: state Stage 1, bottom bar, Stage 1 UI
  MappingStage.tsx     → Stage 2: Font Combine + Font Style + state rungs/tokens
  TypeScaleCards.tsx   → Stage 2: các thẻ Type Scale + token row + popover
src/index.css          → @import Google Fonts + .font-plex/.font-inter/.figma-scrollbar
```

**Giao tiếp UI ↔ backend**: `parent.postMessage({ pluginMessage: { type, ... } }, '*')` → `code.ts` xử lý → `figma.ui.postMessage({ type, ... })` → UI nghe qua `window.addEventListener('message')`.

Message hiện có: `GENERATE_SCALE`, `GET_COLLECTIONS`, `CREATE_VARIABLES`, `GET_STYLES`, `CREATE_STYLES`, `GET_VARIABLES_FOR_IMPORT`, `GET_STYLES_FOR_IMPORT`, `IMPORT_FROM_DESIGN`, `CANCEL` (Color) — và **`GET_FONTS` → `FONTS_LIST`** (Typography).

---

## 3. Nguồn chân lý (đọc trước khi sửa logic)

| Nguồn | Dùng cho |
|---|---|
| `Scaly Spec (Standalone).html` (repo root) | **Logic/thuật toán/edge case**. File self-unpacking — mở bằng browser để đọc, đừng đọc raw HTML. Các mục §4–§15 được trích dẫn trong comment code. |
| Figma `SCALY - Figma Scale Generator` | **Visual tuyệt đối**. fileKey `lTA1sdiR2lBBjQ5t0L7s6H`, section "Topo Scale" node `10:10202`. Stage 1 = `1:4554`, Stage 2 = `1:4173`. |
| Notion (Cá kho lab → Scaly) | Roadmap/Features/Tasks. Xem §8. |

**Quy ước đã chốt với user:** Figma quyết visual, spec quyết logic. Build **UI trước, logic sau**. Ưu tiên font local của Figma.

---

## 4. Mô hình dữ liệu (spec §2, §6)

**Nguyên tắc vàng: tách DANH TÍNH (id ổn định) khỏi VỊ TRÍ (sort theo size).**

```ts
TypoRung  = { id, step, custom, fixed: {desktop?,tablet?,mobile?}, tokens[] }
TypoToken = { id, variantId, fontRole, lineHeightPct, tracking, weights[] }
ModeConfig = { desktop:{base,ratio}, tablet:{...}, mobile:{...} }
TypoCategory = { id, name, kind:'numbered'|'sized', variants[] }   // variants lưu "bare": '1','2' hoặc 'XL','L'
```

- `variantId` = `` `${category.name}-${variant}` `` (vd `Heading-1`, `Title-XL`).
- `fontRole` = `'primary'` | `'secondary-0'` | `'secondary-1'`… (khớp `FontRole.key` trong `TypeScaleCards.tsx`).
- Token bám `rung.id` (ổn định) → đảo thứ tự không mất mapping.

**Công thức cốt lõi (`logic.ts`)**

```
size(rung, mode) = fixed[mode] ?? applyRound(base·ratio^step, round),  floor 10px
order            = sort theo size(·,'desktop') giảm dần   // luôn tính lại, KHÔNG lưu
insert giữa      = geometric mean √(trên·dưới) → rung CUSTOM, ghim cả 3 mode
round            = 0 (số nguyên) | 1 | 2 | 3 (số chữ số thập phân)
```

3 trạng thái rung (§15): **Generated** (bám công thức) · **Overridden** (có ≥1 `fixed[mode]`, hiện chấm cam) · **Custom** (`custom:true`, off-ratio, có badge CUSTOM).

---

## 5. Implementation plan & tracking (ánh xạ Notion)

**Nguồn tracking = Notion Tasks DB** (§8). Mỗi Phase là 1 task; xong phase → set `Status = Done` + tick `Complete`. Bảng dưới là bản mirror — cập nhật **cả hai** khi đổi trạng thái.

### 5.1 Stage ↔ Phase

| Stage (spec §3) | Phase liên quan |
|---|---|
| **Stage 1 · Scale Generator** — base/ratio/steps + preview 1 font | Phase 1, Phase 2 |
| **Stage 2 · Mapping** — Font Combine, Font Style, Type Scale cards | Phase 3, Phase 4 |
| Xuyên suốt cả 2 stage | Phase 5 (logic), Phase 6 (fonts + export) |

### 5.2 Bảng phase

| # | Phase | Status | Notion task |
|---|---|---|---|
| 1 | Scaffold module + Stage 1 UI (controls + live preview) | ✅ Done | [`…6b81c2`](https://app.notion.com/p/3a38ff915162816b81c2e5979e6525df) |
| 2 | Bottom bar 2 stage + chuyển stage + collapse/hide-empty | ✅ Done | [`…2a86ac`](https://app.notion.com/p/3a38ff915162812a86aceecbad631f9b) |
| 3 | Stage 2 — Font Combine + Font Style categories | ✅ Done | [`…78a191`](https://app.notion.com/p/3a38ff9151628178a191d32bd36be517) |
| 4 | Stage 2 — Type Scale cards + token rows | ✅ Done | [`…c5b2e1`](https://app.notion.com/p/3a38ff91516281c5b2e1e72d02355e62) |
| 5 | Core logic: size/order, pin, insert, **regenerate** | 🟡 In progress | [`…08af69`](https://app.notion.com/p/3a38ff9151628108af69dcd966f5facb) |
| 6 | Fonts thật + **backend export 3 collection** | 🟡 In progress | [`…ce924a`](https://app.notion.com/p/3a38ff91516281ce924ac9f38c071cc9) |

### 5.3 Phase 5 — Core logic

*Đã có:* `size/order` (`rungSize`, `orderedRungs`) · neo cấp ô (sửa px → ghim `fixed[mode]`, click chấm cam → reset auto) · insert step (`makeInsertRung`, geometric mean → CUSTOM ghim cả 3 mode) · xoá rung CUSTOM (chỉ khi rỗng) · `pruneTokens` khi xoá category/variant.

*Còn thiếu:*
- [ ] **Regenerate (§8)** — popup "Scale ratio" giữ **draft** base/ratio/steps; bấm Regenerate mới áp; có Revert + nhãn "có thay đổi chưa áp". Thuật toán 5 bước: ghi size hiện tại của rung generated ngoài range mà còn token/fixed → áp thang mới → rung ngoài range & rỗng thì xoá, còn nội dung thì **chuyển CUSTOM ghim size** → bổ sung rung generated còn thiếu → rung đã neo giữ nguyên, re-sort.
- [ ] Nối nút **⚙** trên bottom bar Stage 2 (hiện là stub bắn toast).
- [ ] Giảm steps đè rung có token → tự chuyển CUSTOM (không xoá).
- [ ] FLIP animation khi re-sort (§8 gợi ý).
- [ ] Ẩn động step generated trùng size với rung đã neo (§9); đổi ratio hết trùng thì hiện lại.

### 5.4 Phase 6 — Fonts + export

*Đã có:* `GET_FONTS` → `figma.listAvailableFontsAsync()` → danh sách font-family thật, sort A→Z, fallback `MOCK_FONTS` khi chạy ngoài Figma.

*Còn thiếu:*
- [ ] **Weight thật theo font** (đang dùng `MOCK_WEIGHTS`) — lấy style/weight thật của từng family; variable font → named instances / dải `wght`.
- [ ] **Export 3 collection (§12)** — `Typeface` (font-family/* + font-weight/*) · `Type Scale` (font-size / line-height / tracking, mỗi biến 3 mode D/T/M) · `Styles` (text style thật, bind vào 2 collection kia). **Chỉ rung đã map mới sinh biến.**
- [ ] **Export scale only** ở Stage 1 (chỉ `Type Scale` + frame demo, bỏ Typeface & Styles).
- [ ] Demo frame trên canvas.
- [ ] **`clientStorage`** lưu/khôi phục state → resumable (§3).

### 5.5 Bug / Fix đang mở

| Việc | Status | Notion task |
|---|---|---|
| Rename category không cập nhật token đã map | 🔴 To Do | [`…1c8d20`](https://app.notion.com/p/3a58ff915162811c8d20e5a27733e489) |
| State rung tách đôi Stage 1 ↔ Stage 2 (làm cùng Regenerate) | 🔴 To Do | [`…b58ee3`](https://app.notion.com/p/3a58ff91516281b58ee3f9c4b8c54b0a) |

### 5.6 Thứ tự đề xuất làm tiếp

1. **Fix state rung tách đôi + Regenerate** (5.3) — gộp một lần vì cùng đụng nơi sở hữu `rungs`.
2. **Bug rename** (5.5) — nhỏ, độc lập.
3. **Weight thật** rồi **export 3 collection** (5.4) — export phụ thuộc weight.
4. **clientStorage** cuối cùng, khi shape state đã ổn định.

---

## 6. ⚠️ Known issues (chi tiết kỹ thuật)

> Tracking ở **§5.5**. Dưới đây là phân tích để khỏi phải điều tra lại.

1. **Rename category không cập nhật token đã map.** `renameCategory` (`MappingStage.tsx`) chỉ đổi `category.name`; `token.variantId` trong `rungs` vẫn giữ nhãn cũ → tag dưới tên mới hiện *đen (unmapped)* còn token chip trên card vẫn hiện tên cũ. *(Đã verify: `Display`→`Hero` thì `Hero-1` dark, chip vẫn "Display 1".)* So sánh: `deleteCategory` / `removeVariant` **đã** gọi `pruneTokens`, riêng rename thì chưa. Cần map lại prefix `variantId` cũ→mới cho mọi token.
2. **State rung bị tách đôi.** `TypoApp` build `rungs` riêng cho preview Stage 1; `MappingStage` giữ `rungs` riêng, **seed một lần** từ `stepsUp/stepsDown` lúc mount. Đổi steps ở Stage 1 sau đó **không** propagate sang Stage 2 — đúng tinh thần §8 (regenerate có chủ ý, không live) nhưng **chưa có UI Regenerate** nên đang kẹt. Sửa cùng Phase 5.
3. **Nút ⚙ "Scale ratio (Regenerate)"** ở bottom bar Stage 2 mới là stub (bắn toast) — xem §5.3.
4. **Chưa có persistence** — reload mất hết mapping. Xem `clientStorage` ở §5.4.

---

## 7. Quy ước code & UI

- **Tailwind** (v3.4) + inline style khi cần giá trị động. Không thêm CSS framework khác.
- **Theme**: mọi component nhận prop `theme: 'light' | 'dark'`. Luôn viết cả 2 nhánh màu.
- **Font**: `.font-plex` (IBM Plex Mono — số/token) · `.font-inter` (Inter — label/UI). Đã `@import` từ Google Fonts (whitelist sẵn trong `manifest.json`).
- **Màu accent**: `#ff7818` (cam) = pinned / mapped / CUSTOM. `#131e36` = text đậm. `#94a3b8` = text mờ. `#6b7280` = label.
- **Popover/menu**: dùng `menuSurface(theme)` + `menuItemClass(theme, {active, danger})` từ `ui.tsx` — nền **đặc**, không trong suốt.
- **Pattern hover-reveal**: control phụ ẩn mặc định, hiện khi hover khối cha — `group/<name>` + `opacity-0 group-hover/<name>:opacity-100`. Dùng cho stepper +/- và badge × của chip.
- **Editable**: `EditableField` (ui.tsx, cho text lẫn số) và `MiniEdit` (TypeScaleCards, bản gọn 14px). Cả hai: opacity 60→100, edit có bottom border, ↑/↓ ±1, Shift+↑/↓ ±10, Enter/blur commit, Esc huỷ, giá trị rỗng/không hợp lệ bị bỏ qua (§14).
- **Icon**: thêm vào `src/typo/icons.tsx`, **đừng** import `lucide-react` trong `src/typo/`.
- Card Stage 2 dùng `rounded-[32px]`; z-index giảm dần theo thứ tự card để popover luôn nổi lên trên ("First Above").

---

## 8. Notion (Cá kho lab → Scaly)

Page: `https://app.notion.com/p/3a38ff91516280519bc5cb1e7a595dba`

- **Features** data source `collection://f538ff91-5162-82e1-9a06-87ebc1e0823a` — Status: Idea/Building/Released.
  - "Color Scale Generator" (Released) · "Typography Foundation" (Building, `3a38ff91516281939f90c5b5771a7d98`)
- **Tasks** data source `collection://0c98ff91-5162-82f2-9657-87ccaeb1a5cc` — Status: To Do/In progress/Done + checkbox Complete + relation Features. **8 task** = 6 phase + 2 bug/fix (xem bảng §5.2 và §5.5 để có link từng task).
- **Product Roadmap** `collection://8268ff91-5162-8224-96fb-078dc68afc73` — 4 milestone: Color scale (Shipped) · Color mapping (Planned) · Typography scale (In progress) · Typography mapping (In progress).

**Quy tắc đồng bộ:** khi đổi trạng thái một phase/bug → cập nhật **cả** Notion task **và** bảng ở §5.2/§5.5. Xong phase → `Status = Done` + tick `Complete`.

Truy vấn nhanh trạng thái tất cả task:

```sql
SELECT "Task Name", "Status" FROM "collection://0c98ff91-5162-82f2-9657-87ccaeb1a5cc"
```

---

## 9. Cách verify UI (quan trọng)

Preview pane trong Claude Code có vài giới hạn đã gặp — biết trước để khỏi mất thời gian:

- **Screenshot hay bị stale.** Đừng kết luận "không chạy" chỉ vì ảnh không đổi.
- **Đọc DOM ngay sau click là stale** — React 19 flush sau microtask. Luôn `await new Promise(r=>setTimeout(r,150))` rồi mới đọc.
- **CSS transition bị đóng băng giữa chừng** trong pane → `getComputedStyle().opacity` ra giá trị lẻ (vd `0.17`). Set `el.style.transition='none'` rồi đọc lại.
- **`:hover` không mô phỏng được tin cậy** (toạ độ con trỏ lệch so với `getBoundingClientRect`). Verify hover bằng cách kiểm tra CSS rule đã compile + ép class, đừng cố chụp ảnh hover.
- **Kiểm class kiểu `className.includes('bg-slate-100')` sẽ dính nhầm** `hover:bg-slate-100`. Dùng `getComputedStyle` thay vì so chuỗi class.
- HMR **giữ state cũ** — sau khi đổi giá trị `DEFAULT_*` phải reload trang mới thấy.

Cách chắc ăn: `npx tsc -p tsconfig.json --noEmit` + đọc `getComputedStyle`/DOM qua `javascript_tool` sau khi đã chờ.

---

## 10. Nhắc khi làm việc với user

- User trao đổi bằng **tiếng Việt** — trả lời tiếng Việt.
- User review theo từng bước; **hỏi trước khi đổi hướng lớn**, nhưng cứ làm trọn phần đã thống nhất.
- Khi sửa UI, user thường đưa **ảnh chụp Figma kèm mô tả state** — bám đúng mô tả đó, đừng tự suy diễn (đã từng hiểu nhầm "chip đen = selected" trong khi thực ra là **hover state**).
