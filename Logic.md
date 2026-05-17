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
