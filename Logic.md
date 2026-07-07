# Scaly Plugin - Technical Documentation

Tài liệu này mô tả chi tiết kiến trúc, cấu trúc dữ liệu, thuật toán lõi và các tính năng của plugin Scaly - công cụ tạo dải màu (Color Scale Generator) dành cho Figma.

---

## 1. Tổng quan Project (Overview)
- **Mục đích**: Tạo ra các dải màu có độ tương phản và chuyển màu mượt mà dựa trên không gian màu **OKLCH** (không gian màu hiện đại giúp giữ nguyên cảm nhận về độ sáng khi thay đổi sắc độ).
- **Tech Stack**:
  - UI: React, TailwindCSS.
  - Color Math: `chroma-js`.
  - Kéo thả (Drag & Drop): `@dnd-kit` (core & sortable).
  - Bundler: Vite.
  - Figma Plugin API.

---

## 2. Cấu trúc Dữ liệu (Data Structures)

### 2.1. `ColorNode` (Đại diện cho 1 ô màu / Shade)
Mỗi ô màu trong dải được định nghĩa bởi object này:
```typescript
type ColorNode = {
  id: string;          // ID duy nhất dùng cho dnd-kit và React keys
  index: number;       // Vị trí hiện tại trong dải màu (0 -> stepCount + 1)
  label: string | number; // Nhãn hiển thị cố định (VD: "white", 50, 100, ..., 950, "black")
  hex: string | null;  // Mã màu Hex. Nếu không phải là Anchor, giá trị này sẽ bị ghi đè bởi thuật toán nội suy.
  isAnchor: boolean;   // Đánh dấu đây có phải là điểm neo cố định không.
  locked: boolean;     // Khóa vị trí (chỉ True đối với White ở đầu và Black ở cuối).
};
```

### 2.2. `ScaleData` (Đại diện cho 1 dải màu)
```typescript
interface ScaleData {
  id: string;
  name: string;
  stepCount: number;   // Số lượng ô màu do user chọn (9, 11, 13, 15)
  nodes: ColorNode[];  // Mảng các ô màu đang hiển thị (bao gồm cả White và Black)
  
  // Master Map (BỘ NHỚ BỀN VỮNG)
  // Lưu trữ mọi điểm neo user từng tạo dưới dạng Key-Value: { "label": "hex" }
  // VD: { "500": "#FF0000", "25": "#FEFEFE" }
  fullAnchorMap: Record<string, string>; 
}
```

---

## 3. Thuật toán Lõi (Core Algorithms)

### 3.1. Nội suy màu sắc (`interpolateColors`)
Đây là trái tim của plugin, chịu trách nhiệm tính toán các màu nằm giữa các điểm neo.
- **Input**: Mảng `currentNodes`.
- **Logic**:
  1. Lọc ra danh sách các `anchors` (`isAnchor === true`) và sắp xếp theo `index`.
  2. Nếu không có anchor nào (hiếm), trả về mảng gốc.
  3. Nếu chỉ có **1 điểm neo** (không tính White/Black), nó sẽ tạo dải nội suy 3 điểm: `White -> Anchor -> Black`.
  4. Nếu có **>= 2 điểm neo**, nó nội suy qua tất cả các điểm neo đó.
  5. Sử dụng `chroma.scale(colors).domain(domain).mode('oklch')` để tạo hàm nội suy.
  6. Lặp qua tất cả `currentNodes`: Nếu ô đó là Anchor thì giữ nguyên, nếu không thì dùng hàm `scale` để tính ra mã Hex mới dựa trên `index`.

### 3.2. Hệ thống Nhãn màu (`getLabel`)
Hàm `getLabel(idx, stepCount)` là mapping logic chuyển đổi từ vị trí mảng (index) sang tên nhãn thực tế (50, 100, 200...).
- Nhãn phụ thuộc vào `stepCount`. 
- VD: Ở 11 steps, index 1 là "50". Nhưng ở 13 steps, index 1 là "25", index 2 mới là "50".
- *Lý do dùng Nhãn*: Nhãn là giá trị "bất biến" duy nhất khi user thay đổi `stepCount`.

---

## 4. Phân tích Các Tính năng (Features Deep Dive)

### 4.1. Hệ thống "Trí nhớ" Điểm neo (Anchor Persistence)
*Vấn đề:* Khi đổi từ 11 steps sang 15 steps, mảng `nodes` bị tạo mới hoàn toàn, làm mất các Anchor.
*Giải pháp `fullAnchorMap`:*
- Mọi thao tác thêm/sửa/xóa/kéo thả Anchor đều được đồng bộ ngay lập tức vào `fullAnchorMap` thông qua `label`.
- Hàm `handleStepCountChange`: Khi user đổi Step, hệ thống tạo mảng `nodes` mới, sau đó duyệt qua `fullAnchorMap`. Nếu `label` của Node mới tồn tại trong Map, nó được khôi phục thành Anchor với mã Hex tương ứng.
- **Hidden Anchors**: Nếu một Anchor nằm ở `label` không tồn tại trong step count hiện tại (VD: label "25" không có ở 9 steps), nó sẽ không xuất hiện trong mảng `nodes` (bị ẩn đi), nhưng vẫn tồn tại trong `fullAnchorMap`. Khi user quay lại step count phù hợp, nó sẽ tự hiện ra lại.

### 4.2. Xử lý Kéo thả (Drag & Drop)
- **Thư viện**: `@dnd-kit`.
- **Cấu hình**: `activationConstraint: { distance: 5 }` (Phải kéo chuột xa hơn 5px mới tính là drag, tránh xung đột với sự kiện click).
- **Logic `handleDragEnd`**:
  1. Đổi vị trí 2 Node trong mảng bằng `arrayMove`.
  2. Gán lại `index` cho toàn bộ mảng.
  3. Tính lại `label` mới cho toàn bộ mảng dựa trên `index` mới.
  4. **Auto-Anchor**: Node vừa được kéo mặc định sẽ gán `isAnchor = true`.
  5. Ghi đè mã Hex của Node đó vào `fullAnchorMap` tại key là `label` mới của nó.
  6. Chạy lại `interpolateColors` để tính lại dải màu.

### 4.3. Chỉnh sửa Màu (Color Edit Sliders)
Component `ColorPicker` không dùng color picker mặc định của trình duyệt mà tự code 3 thanh trượt Hue, Saturation, Lightness.
- **Smart State Preservation**: Hàm `chroma.hsl()` có một nhược điểm toán học là khi Lightness (L) = 0 (Đen) hoặc 1 (Trắng), Hue và Saturation sẽ mất ý nghĩa và biến thành 0 hoặc `NaN`. 
- *Cách fix trong code*: Bắt sự kiện trong `useEffect` và `onChange`, nếu phát hiện `L === 0` hoặc `L === 1`, hệ thống sẽ sử dụng lại giá trị Hue và Saturation từ State cũ, tránh việc thanh trượt bị nhảy về 0 một cách vô lý.

### 4.4. Copy & Toast Notification
- Ô màu có gắn sự kiện `onClick` (không bị trùng lặp với Drag nhờ constraint 5px).
- Góp nhặt mã màu: `navigator.clipboard.writeText(hex)`.
- **Toast**: Được quản lý ở root `App` thông qua state `toast: string | null`. Hiển thị fixed ở top màn hình với animation CSS `animate-in fade-in slide-in-from-top-4`, tự động tắt sau 2000ms thông qua `setTimeout`.

---

## 5. Giao diện (UI/UX)
- **Theme**: Hỗ trợ Light/Dark mode. Chuyển đổi bằng state `theme`. Class CSS được toggle tự động (Sử dụng Tailwind `dark` class hoặc điều kiện inline).
- **Gradient Bar**: Nằm dưới các ô màu. Được render bằng một thẻ `div` với style `background: linear-gradient(to right, ...)`. Danh sách màu đưa vào hàm `linear-gradient` chính là các màu từ mảng `nodes` sau khi đã nội suy, tạo ra dải màu liên tục trực quan hóa quá trình OKLCH đang làm việc.
- **Thanh trượt Tối giản**: Để tạo thumb (chấm tròn kéo thả) đen hoàn toàn, không có viền bóng mặc định của trình duyệt, đã sử dụng CSS overrides trong `index.css` cho psuedo-elements `::-webkit-slider-thumb` và `::-moz-range-thumb`.

---

## 6. Figma Communication
Khi user bấm "Create Figma Styles":
1. Hàm `generateFigmaNodes` được gọi.
2. Lọc bỏ `White` (index 0) và `Black` (index cuối) vì chúng chỉ dùng để chốt nội suy, không thuộc về output.
3. Chuyển đổi mã Hex sang định dạng RGB mà Figma API yêu cầu (Object `{r, g, b}` với giá trị từ 0 -> 1).
4. Gửi thông điệp: `parent.postMessage({ pluginMessage: { type: 'GENERATE_SCALE', scales: allScaleNodes } }, '*')`.
5. Figma backend (`code.ts`) nhận data và tiến hành tạo Frame, Rectangle, Text và gán Local Styles.

---

## 7. Figma Plugin Icons & Community Assets Guidelines

This section describes how the visual identity (icons, cover art, and assets) of the **Scaly** plugin is handled in different environments:

### 7.1. Figma Community Publish (Official Release)
When publishing your plugin to the official Figma Community store:
* **Dashboard Upload**: Figma handles the official plugin logo, cover banners, description, and screenshots directly via the **Figma Web Publishing Dashboard** on Figma.com.
* **Asset Specifications**:
  * **Plugin Icon**: Must be a square artwork. Suggested sizes are **128x128px** or **256x256px** (PNG, JPG, or SVG).
  * **Cover Art**: A landscape banner of **1920x960px** (2:1 aspect ratio) representing the plugin's branding.

### 7.2. Local Development (Figma Desktop / Browser)
* **Local Manifest Limitation**: Figma's `manifest.json` schema is highly strict. It **does not support** a top-level `"icon"` key. Adding `"icon": "icon.png"` at the root of `manifest.json` will trigger a compile/validation error: `Manifest has unexpected extra property: icon`.
* **Icon in Local Lists**: Figma displays a default grey puzzle-piece icon for all local development plugins. This is normal developer behavior and cannot be bypassed locally via manifest files.
* **Safe Keep**: Keep `icon.png` in the root directory as an asset so you can easily select and upload it when going through the online Figma Community publishing flow.

### 7.3. Browser Favicon (Development Web App)
If you run the UI standalone in your browser for rapid mockup testing (e.g., using `npm run dev` or equivalent Vite servers), you can configure a standard website favicon by placing a `<link>` tag in the `<head>` section of `index.html`:
```html
<link rel="icon" type="image/png" href="/icon.png" />
```

---

## 8. Figma Community Listing Copy

Here is the highly polished, professional, and descriptive English copy ready for you to copy and paste into the Figma Community publishing form:

### 8.1. Name
`Scaly` (or `Scaly - OKLCH Color Scale Generator`)

### 8.2. Tagline
`The ultimate OKLCH color scale generator with persistent anchors, styles, and variables export.`

### 8.3. Description

```markdown
🎨 Create perfectly balanced, visually uniform color systems with Scaly—the advanced OKLCH-based color scale generator for Figma.

No more awkward, muddy, or gray-ish intermediate tones. Scaly utilizes the modern OKLCH color space to calculate smooth color gradients that preserve perceived lightness and uniform brightness across all color steps.

⚡ KEY FEATURES

1️⃣ OKLCH Interpolation: Generates highly vibrant and mathematically balanced color palettes.
2️⃣ Persistent Anchors: Pin specific key colors as anchor points (marked with '*'). Locked key colors persist and auto-align even when changing step counts (9, 11, 13, or 15 steps).
3️⃣ Smart Drag & Drop: Drag color nodes to rearrange shades easily with intuitive live rendering.
4️⃣ Two-way Variables & Styles Import/Export:
   • Export generated palettes directly to Figma Local Variables and Paint Styles with support for 'Append' or 'Replace'.
   • Import your existing Variables or Styles back into Scaly to fine-tune, modify, or extend them.
5️⃣ Precision Sliders: Tweak HSL parameters with high-accuracy sliders designed to preserve colors even at pure black or white limits.
6️⃣ Beautiful Fluid UI: Supports dark/light mode toggle with a premium glassmorphic interface and instant clipboard copies.

🚀 HOW TO USE

1. Open Scaly inside your Figma file.
2. Select your base color or import existing variables/styles.
3. Lock/unlock key shades as anchors, adjust step counts, and drag color nodes to refine the palette.
4. Click 'Export' to create variables or styles, or generate color rectangles directly in your workspace.
```

### 8.4. Category
`Design tools` or `Development`

### 8.5. Tags (Keywords)
`color`, `palette`, `generator`, `oklch`, `variables`, `tokens`, `styles`, `contrast`, `design-system`
