# Third-party notices

This application embeds or loads the following libraries. Their licences permit
use inside a combined work, commercial included, provided these notices are
retained.

## pdf-lib (Cantoo fork) — MIT

Used for creating, merging, splitting, rotating, watermarking, numbering and
**encrypting** PDF documents.

    MIT License

    Copyright (c) 2019 Andrew Dillon

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in
    all copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.

    Upstream: https://github.com/Hopding/pdf-lib
    Fork:     https://github.com/cantoo-scribe/pdf-lib  (adds encryption)

## pdf.js — Apache License 2.0

Used for rendering PDF pages to canvas (thumbnails, compression and OCR input).

    Copyright 2012 Mozilla Foundation

    Licensed under the Apache License, Version 2.0 (the "License"); you may not
    use this file except in compliance with the License. You may obtain a copy of
    the License at

        http://www.apache.org/licenses/LICENSE-2.0

    Unless required by applicable law or agreed to in writing, software
    distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
    WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
    License for the specific language governing permissions and limitations
    under the License.

## tesseract.js — Apache License 2.0

Used for optical character recognition. The library is loaded on demand, not
bundled, and runs inside a Web Worker.

    Copyright contributors to tesseract.js
    Licensed under the Apache License, Version 2.0.
    https://github.com/naptha/tesseract.js

## Tesseract OCR engine — Apache License 2.0

The recognition engine behind tesseract.js (compiled to WebAssembly).

    Copyright contributors to the Tesseract OCR project
    Licensed under the Apache License, Version 2.0.
    https://github.com/tesseract-ocr/tesseract

## Language data

The OCR language model (`eng.traineddata`, and others) is downloaded from the
`tessdata` project. These are distributed under the Apache License 2.0.
https://github.com/naptha/tessdata

---

No third-party **data or content** is bundled with this application: it ships no
corpora, no fonts and no text of its own.
