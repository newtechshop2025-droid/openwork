> OpenWork là giải pháp thay thế mã nguồn mở cho Claude Cowork/Codex (ứng dụng máy tính để bàn).


## Triết lý Cốt lõi

- Ưu tiên chạy cục bộ (local-first), sẵn sàng cho đám mây: OpenWork chạy trên máy của bạn chỉ với một cú nhấp chuột. Gửi tin nhắn ngay lập tức.
- Có khả năng cấu trúc linh hoạt (composable): ứng dụng máy tính để bàn, cổng kết nối Slack/Telegram hoặc máy chủ. Sử dụng bất kỳ hình thức nào phù hợp, không bị ràng buộc nền tảng.
- Có thể tách rời (ejectable): OpenWork được cung cấp sức mạnh bởi OpenCode, vì vậy mọi thứ OpenCode có thể làm đều hoạt động trong OpenWork, ngay cả khi chưa có giao diện người dùng.
- Chia sẻ là quan tâm (sharing is caring): bắt đầu độc lập trên localhost, sau đó chủ động chọn chia sẻ từ xa khi bạn cần.

<p align="center">
  <img src="./app-demo.gif" alt="OpenWork demo" width="800" />
</p>

OpenWork được thiết kế xoay quanh ý tưởng rằng bạn có thể dễ dàng phân phối các quy trình làm việc tự động (agentic workflows) cho nhóm của mình dưới dạng một quy trình lặp lại, được đóng gói thành sản phẩm.

> [!TIP]
> **Bạn đang tìm kiếm [Gói Doanh nghiệp](https://openworklabs.com/enterprise)?** [Hãy trò chuyện với Đội ngũ Bán hàng của chúng tôi ngay hôm nay](https://calendar.app.google/86QpCENvhfEzDFLu5)
>
> Nhận các khả năng nâng cao bao gồm ưu tiên tính năng, đăng nhập một lần (SSO), hỗ trợ SLA, phiên bản hỗ trợ dài hạn (LTS), và nhiều hơn nữa.

## Các giao diện thay thế
- **OpenWork Orchestrator (CLI host)**: chạy máy chủ OpenCode + OpenWork mà không cần giao diện ứng dụng máy tính để bàn.
  - cài đặt: `npm install -g openwork-orchestrator`
  - chạy: `openwork start --workspace /path/to/workspace --approval auto`
  - tài liệu: [apps/orchestrator/README.md](./apps/orchestrator/README.md)

## Khởi động nhanh

Tải xuống ứng dụng máy tính để bàn từ [openworklabs.com/download](https://openworklabs.com/download), tải bản phát hành mới nhất từ [GitHub release](https://github.com/different-ai/openwork/releases), hoặc cài đặt từ nguồn bên dưới.

- Các bản tải xuống cho macOS và Linux luôn có sẵn trực tiếp.
- Quyền truy cập trên Windows hiện được xử lý thông qua gói hỗ trợ trả phí trên [openworklabs.com/pricing#windows-support](https://openworklabs.com/pricing#windows-support).
- Các nhân tố đám mây OpenWork Cloud được lưu trữ sẽ được khởi chạy từ ứng dụng web sau khi thanh toán, sau đó được kết nối từ ứng dụng máy tính để bàn thông qua `Add a worker` -> `Connect remote`.

## Tại sao

Các giao diện dòng lệnh (CLI) và giao diện đồ họa (GUI) hiện tại cho opencode đang tập trung xoay quanh các nhà phát triển. Điều đó có nghĩa là tập trung vào các khác biệt tệp (file diffs), tên công cụ, và các khả năng khó mở rộng nếu không phụ thuộc vào việc để lộ một số dạng dòng lệnh.

OpenWork được thiết kế để:

- **Có thể mở rộng**: các plugin kỹ năng (skill) và opencode là các mô-đun có thể cài đặt được.
- **Có thể kiểm toán**: hiển thị những gì đã xảy ra, khi nào và tại sao.
- **Được phân quyền**: truy cập vào các luồng có đặc quyền.
- **Cục bộ/Từ xa**: OpenWork hoạt động cục bộ cũng như có thể kết nối với các máy chủ từ xa.

## Các tính năng bao gồm

- **Chế độ máy chủ (Host mode)**: chạy opencode cục bộ trên máy tính của bạn
- **Chế độ khách (Client mode)**: kết nối với máy chủ OpenCode hiện có thông qua URL.
- **Phiên làm việc (Sessions)**: tạo/chọn các phiên làm việc và gửi câu lệnh (prompts).
- **Phát trực tiếp (Live streaming)**: đăng ký nhận SSE `/event` để cập nhật thời gian thực.
- **Kế hoạch thực thi**: hiển thị các đầu việc cần làm (todos) của OpenCode dưới dạng một dòng thời gian.
- **Quyền hạn**: hiển thị các yêu cầu cấp quyền và phản hồi (cho phép một lần / luôn cho phép / từ chối).
- **Mẫu (Templates)**: lưu và chạy lại các quy trình làm việc phổ biến (được lưu trữ cục bộ).
- **Xuất nhật ký lỗi**: sao chép hoặc xuất báo cáo gỡ lỗi thời gian chạy và luồng nhật ký nhà phát triển từ Settings -> Debug khi bạn cần báo cáo lỗi.
- **Trình quản lý kỹ năng (Skills manager)**:
  - liệt kê các thư mục `.opencode/skills` đã cài đặt
  - nhập một thư mục kỹ năng cục bộ vào `.opencode/skills/<skill-name>`

## Trình quản lý kỹ năng

<img width="1292" height="932" alt="image" src="https://github.com/user-attachments/assets/b500c1c6-a218-42ce-8a11-52787f5642b6" />

## Hoạt động trên máy tính cục bộ hoặc máy chủ

<img width="1292" height="932" alt="Screenshot 2026-01-13 at 7 05 16 PM" src="https://github.com/user-attachments/assets/9c864390-de69-48f2-82c1-93b328dd60c3" />

## Hướng dẫn khởi động nhanh

### Yêu cầu hệ thống

- Node.js + `pnpm`
- Bộ công cụ Rust (cho Tauri): cài đặt qua `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- Tauri CLI: `cargo install tauri-cli`
- Đã cài đặt OpenCode CLI và có sẵn trong PATH: `opencode`

### Điều kiện tiên quyết để phát triển cục bộ (Máy tính để bàn)

Trước khi chạy `pnpm dev`, đảm bảo các công cụ sau đã được cài đặt và kích hoạt trong terminal của bạn:

- Node + pnpm (kho lưu trữ sử dụng `pnpm@10.27.0`)
- **Bun 1.3.9+** (`bun --version`)
- Bộ công cụ Rust (cho Tauri), với Cargo từ phiên bản stable hiện tại của `rustup` (hỗ trợ `Cargo.lock` v4)
- Xcode Command Line Tools (đối với macOS)
- Trên Linux, các gói phát triển WebKitGTK 4.1 để `pkg-config` có thể phân giải `webkit2gtk-4.1` và `javascriptcoregtk-4.1`

### Kiểm tra nhanh trong một phút

Chạy từ thư mục gốc của kho lưu trữ:

```bash
git checkout dev
git pull --ff-only origin dev
pnpm install --frozen-lockfile

which bun
bun --version
pnpm --filter @openwork/desktop exec tauri --version
```

### Cài đặt

```bash
pnpm install
```

OpenWork hiện nằm ở `apps/app` (giao diện người dùng) và `apps/desktop` (vỏ ứng dụng máy tính để bàn).

### Chạy (Máy tính để bàn)

```bash
pnpm dev
```

`pnpm dev` hiện sẽ tự động kích hoạt `OPENWORK_DEV_MODE=1`, nhờ đó việc phát triển trên máy tính để bàn sẽ sử dụng trạng thái OpenCode độc lập thay vì cấu hình/xác thực/dữ liệu toàn cục cá nhân của bạn.

### Chạy (Chỉ giao diện Web)

```bash
pnpm dev:ui
```

Tất cả các điểm khởi đầu `dev` trong kho lưu trữ hiện đã chọn chế độ cô lập tương tự để việc kiểm thử cục bộ sử dụng trạng thái OpenCode do OpenWork quản lý một cách nhất quán.

### Đối với người dùng Arch:

```bash
sudo pacman -S --needed webkit2gtk-4.1
curl -fsSL https://opencode.ai/install | bash -s -- --version "$(node -e "const fs=require('fs'); const parsed=JSON.parse(fs.readFileSync('constants.json','utf8')); process.stdout.write(String(parsed.opencodeVersion||'').trim().replace(/^v/,''));")" --no-modify-path
```

## Kiến trúc (tổng quan)

- Ở **Chế độ máy chủ (Host mode)**, OpenWork chạy một ngăn xếp máy chủ cục bộ và kết nối giao diện người dùng với nó.
  - Trình chạy mặc định (runtime): `openwork` (được cài đặt từ `openwork-orchestrator`), điều phối `opencode`, `openwork-server`, và tùy chọn `opencode-router`.
  - Trình chạy dự phòng: `direct`, nơi ứng dụng máy tính để bàn tự khởi chạy `opencode serve --hostname 127.0.0.1 --port <free-port>` trực tiếp.

Khi bạn chọn một thư mục dự án, OpenWork chạy ngăn xếp máy chủ cục bộ bằng cách sử dụng thư mục đó và kết nối giao diện máy tính để bàn.
Điều này cho phép bạn chạy các quy trình làm việc tự động, gửi câu lệnh và xem tiến trình hoàn toàn trên máy của bạn mà không cần máy chủ từ xa.

- Giao diện người dùng sử dụng `@opencode-ai/sdk/v2/client` để:
  - kết nối với máy chủ
  - liệt kê/tạo các phiên làm việc
  - gửi các câu lệnh
  - đăng ký nhận các sự kiện SSE (Server-Sent Events được sử dụng để truyền trực tuyến các cập nhật thời gian thực từ máy chủ đến giao diện người dùng.)
  - đọc các đầu việc cần làm (todos) và yêu cầu cấp quyền

## Trình chọn thư mục (Folder Picker)

Trình chọn thư mục sử dụng plugin hộp thoại của Tauri.
Quyền hạn khả năng được định nghĩa trong:

- `apps/desktop/src-tauri/capabilities/default.json`

## Plugin OpenCode

Các plugin là cách thức **gốc** để mở rộng OpenCode. OpenWork hiện quản lý chúng từ tab Kỹ năng (Skills) bằng cách
đọc và ghi vào tệp `opencode.json`.

- **Phạm vi dự án**: `<workspace>/opencode.json`
- **Phạm vi toàn cục**: `~/.config/opencode/opencode.json` (hoặc `$XDG_CONFIG_HOME/opencode/opencode.json`)

Bạn vẫn có thể chỉnh sửa `opencode.json` theo cách thủ công; OpenWork sử dụng định dạng tương tự như giao diện dòng lệnh của OpenCode (OpenCode CLI):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-wakatime"]
}
```

## Các lệnh hữu ích

```bash
pnpm dev
pnpm dev:ui
pnpm typecheck
pnpm build
pnpm build:ui
pnpm test:e2e
```

## Xử lý sự cố (Troubleshooting)

Nếu bạn cần báo cáo lỗi liên quan đến máy tính để bàn hoặc phiên làm việc, hãy mở Settings -> Debug và xuất cả báo cáo gỡ lỗi thời gian chạy và nhật ký nhà phát triển trước khi gửi yêu cầu hỗ trợ.

### Linux / Wayland (Hyprland)

Nếu OpenWork bị sập khi khởi chạy với các lỗi WebKitGTK như `Failed to create GBM buffer`, hãy vô hiệu hóa dmabuf hoặc compositing trước khi khởi chạy. Hãy thử một trong các cờ môi trường sau.

```bash
WEBKIT_DISABLE_DMABUF_RENDERER=1 openwork
```

```bash
WEBKIT_DISABLE_COMPOSITING_MODE=1 openwork
```

## Lưu ý Bảo mật

- OpenWork ẩn suy luận của mô hình và siêu dữ liệu công cụ nhạy cảm theo mặc định.
- Chế độ máy chủ liên kết với địa chỉ `127.0.0.1` theo mặc định.

## Đóng góp

- Xem lại tệp `AGENTS.md` cùng với `VISION.md`, `PRINCIPLES.md`, `PRODUCT.md`, và `ARCHITECTURE.md` để hiểu các mục tiêu sản phẩm trước khi thực hiện các thay đổi.
- Đảm bảo Node.js, `pnpm`, bộ công cụ Rust, và `opencode` đã được cài đặt trước khi làm việc trong kho lưu trữ này.
- Chạy `pnpm install` một lần cho mỗi lần kiểm tra mã nguồn (checkout), sau đó xác minh thay đổi của bạn bằng lệnh `pnpm typecheck` cùng với `pnpm test:e2e` (hoặc tập hợp các tập lệnh mục tiêu cụ thể) trước khi mở một PR.
- Sử dụng mẫu `.github/pull_request_template.md` khi mở các PR và bao gồm các lệnh chính xác đã chạy, kết quả, các bước xác minh thủ công và bằng chứng thực tế.
- Nếu CI thất bại, hãy phân loại các lỗi trong phần thân của PR là do các lỗi hồi quy liên quan đến mã nguồn hay do các rào cản từ bên ngoài/môi trường/xác thực.
- Thêm các PRD mới vào `apps/app/pr/<name>.md` theo các quy ước `.opencode/skills/prd-conventions/SKILL.md` được mô tả trong `AGENTS.md`.

Tài liệu cộng đồng:

- `CODE_OF_CONDUCT.md`
- `SECURITY.md`
- `SUPPORT.md`
- `TRIAGE.md`

Danh sách kiểm tra cho lần đóng góp đầu tiên:

- [ ] Chạy `pnpm install` và các lệnh xác minh cơ bản.
- [ ] Xác nhận thay đổi của bạn có liên kết rõ ràng đến issue và phạm vi công việc rõ ràng.
- [ ] Thêm/cập nhật các bài kiểm thử cho những thay đổi về hành vi.
- [ ] Đính kèm các lệnh đã chạy và kết quả trong PR của bạn.
- [ ] Thêm ảnh chụp màn hình/video cho những thay đổi liên quan đến luồng giao diện người dùng.

## Các ngôn ngữ được hỗ trợ

Các tài liệu README đã dịch: [`translated_readmes/`](./translated_readmes/README.md), hiện có sẵn bằng các ngôn ngữ Tiếng Anh, 简体中文, 繁體中文, 日本語.

Ứng dụng hiện có sẵn bằng các ngôn ngữ sau:
- Tiếng Anh (`en`)
- Tiếng Pháp (`fr`)
- Tiếng Tây Ban Nha (`es`)
- Tiếng Catalan (`ca`)
- Tiếng Bồ Đào Nha Brazil (`pt-BR`)
- Tiếng Nhật (`ja`)
- Tiếng Trung giản thể (`zh`)
- Tiếng Thái (`th`)
- Tiếng Việt (`vi`)
- Tiếng Nga (`ru`)

## Dành cho các Nhóm & Doanh nghiệp

Bạn có hứng thú với việc sử dụng OpenWork trong tổ chức của mình? Chúng tôi rất mong nhận được phản hồi từ bạn — hãy liên hệ tại [ben@openworklabs.com](mailto:ben@openworklabs.com) để trao đổi về trường hợp sử dụng của bạn.

## Giấy phép

MIT — xem tệp `LICENSE`.
