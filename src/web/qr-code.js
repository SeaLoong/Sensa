/*!
 * qrcode-generator 2.0.4 — Copyright (c) 2009 Kazuhiko Arase
 * https://github.com/kazuhikoarase/qrcode-generator
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
 * of the Software, and to permit persons to whom the Software is furnished to do
 * so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
import qrcode from 'qrcode-generator';

// The relay supplies the full pairing URL. Encode it locally, including UTF-8
// when a custom relay uses international characters.
qrcode.stringToBytes = value => Array.from(new globalThis.TextEncoder().encode(value));

export function qrCodeImage(value) {
  if (typeof value !== 'string' || !value || value.length > 4096) return null;
  try {
    const code = qrcode(0, 'M');
    code.addData(value, 'Byte'); code.make();
    const count = code.getModuleCount(), quietZone = 4;
    let path = '';
    for (let row = 0; row < count; row++) for (let column = 0; column < count; column++) {
      if (code.isDark(row, column)) path += `M${column + quietZone} ${row + quietZone}h1v1h-1z`;
    }
    return { size: count + quietZone * 2, path };
  } catch { return null; }
}
