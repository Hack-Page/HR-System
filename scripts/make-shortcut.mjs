/**
 * Tạo file shortcut có icon riêng để gửi cho đồng nghiệp.
 *
 * Cách hoạt động:
 *   1. Máy chủ (máy cố định) chạy:  npm run build && npm run serve
 *      -> hệ thống chạy tại http://<IP-MÁY-CHỦ>:4173
 *   2. Trên máy chủ chạy:           npm run shortcut -- <IP-MÁY-CHỦ>
 *      -> sinh thư mục shortcuts/ chứa:
 *        - SmartHR.url        : Windows - double-click mở trình duyệt, kèm icon
 *        - SmartHR.desktop    : Linux
 *        - favicon.ico        : icon đi kèm (copy cùng chỗ với .url)
 *   3. Gửi file trong shortcuts/ cho đồng nghiệp (kèm hướng dẫn đặt vào Desktop).
 *
 * Lưu ý Windows: SmartHR.url và smarthr-favicon.ico phải nằm CÙNG THƯ MỤC trên
 * máy người dùng thì icon mới hiển thị.
 */
import { writeFileSync, mkdirSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'shortcuts');

const ip = process.argv[2];
const port = process.argv[3] || '4173';

if (!ip) {
  console.error('Cách dùng: npm run shortcut -- <IP-MÁY-CHỦ> [port]');
  console.error('Ví dụ:      npm run shortcut -- 192.168.1.50');
  console.error('(Xem IP của máy chủ: Windows `ipconfig` | Linux `hostname -I`)');
  process.exit(1);
}

const url = `http://${ip}:${port}`;
mkdirSync(outDir, { recursive: true });

// 1. Windows Internet Shortcut (đặt cùng thư mục với icon để hiện icon riêng)
const urlFile = [
  '[InternetShortcut]',
  `URL=${url}`,
  'IconIndex=0',
  'IconFile=smarthr-favicon.ico',
  '',
].join('\r\n');
writeFileSync(join(outDir, 'SmartHR.url'), urlFile);

// 2. Linux desktop entry
writeFileSync(
  join(outDir, 'SmartHR.desktop'),
  [
    '[Desktop Entry]',
    'Version=1.0',
    'Type=Application',
    'Name=SmartHR',
    'Comment=Hệ thống chấm công & quản trị nhân sự Leggett & Platt',
    `Exec=xdg-open ${url}`,
    'Icon=smarthr-favicon.ico',
    'Terminal=false',
    '',
  ].join('\n')
);

// 3. Icon đi kèm + README ngắn
copyFileSync(join(root, 'public', 'favicon.ico'), join(outDir, 'smarthr-favicon.ico'));
writeFileSync(
  join(outDir, 'HUONG-DAN.txt'),
  [
    'HƯỚNG DẪN DÙNG SHORTCUT SMARTHR',
    '================================',
    '',
    `Địa chỉ hệ thống: ${url}`,
    '(Máy chủ phải đang bật: npm run serve)',
    '',
    'WINDOWS:',
    '  1. Copy HAI file "SmartHR.url" và "smarthr-favicon.ico" vào Desktop.',
    '     (Phải để cùng chỗ thì biểu tượng mới hiển thị đúng)',
    '  2. Double-click SmartHR để mở.',
    '',
    'LƯU Ý QUAN TRỌNG:',
    '- Đây KHÔNG PHẢI app chạy từ file - dữ liệu lưu trên MÁY NGƯỜI DÙNG',
    '  theo tài khoản đăng nhập; máy chủ chỉ phân phối giao diện.',
    `- Nếu không mở được: kiểm tra máy chủ đã chạy "npm run serve" chưa và`,
    '  tường lửa máy chủ có cho phép port ' + port + ' không.',
    '',
  ].join('\n')
);

console.log(`✓ Đã tạo shortcuts/ cho ${url}`);
console.log('  - SmartHR.url          (Windows)');
console.log('  - SmartHR.desktop      (Linux)');
console.log('  - smarthr-favicon.ico  (icon đi kèm)');
console.log('  - HUONG-DAN.txt');
console.log('\nGửi cả thư mục shortcuts/ cho đồng nghiệp là xong.');
