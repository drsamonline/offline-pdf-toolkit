/* =====================================================================
   Interface languages: English, हिन्दी, ગુજરાતી.

   English is the source, so it has no table: the strings live in the markup
   and this file only knows how to replace them. Every translatable text node is
   recorded once, with its English original, and swapping a language rewrites
   those nodes in place — which is why the panels keep their spans, counters and
   controls instead of being flattened by a textContent assignment.

   The Help text and the long explanatory paragraphs stay in English on purpose:
   a wrong word in a clinical document is worse than an English one, and they
   need a human read before they are translated.
   ===================================================================== */
const I18N = {
  en: {},
  hi: {
    "Save PDF":"PDF सेव करें", "Pages":"पेज", "Tools":"टूल्स", "Select all":"सब चुनें",
    "Clear":"साफ करें", "Duplicate":"डुप्लीकेट", "Insert blank":"खाली पेज डालें",
    "Delete":"डिलीट करें", "Extract to new PDF":"नए PDF में निकालें", "Clear all":"सब साफ करें",
    "Reset tools":"टूल्स रीसेट करें", "Choose a PDF…":"PDF चुनें…", "Extract text":"टेक्स्ट निकालें",
    "Load engine":"इंजन लोड करें", "Close":"बंद करें", "Split now":"अभी स्प्लिट करें",
    "Export pages as PNG":"पेज को PNG के रूप में एक्सपोर्ट करें",
    "Run self-test":"सेल्फ-टेस्ट रन करें", "Find fields":"फील्ड्स खोजें",
    "Load a picture…":"तस्वीर डालें…", "Extract images":"तस्वीरें निकालें", "Files":"फाइलें",
    "Watermark":"वाटरमार्क", "Page numbers":"पेज नंबर", "Metadata":"मेटाडेटा",
    "Compress":"कंप्रेस करें", "Password protect":"पासवर्ड से सुरक्षित करें",
    "Unlock a PDF":"PDF अनलॉक करें", "OCR":"OCR", "Document":"डॉक्यूमेंट",
    "Credits & licences":"क्रेडिट और लाइसेंस", "Page size & trim":"पेज का साइज़ और ट्रिम",
    "Impose (N-up)":"इम्पोज़ (N-up)", "Header & footer":"हेडर और फुटर",
    "Bates numbering":"बेट्स नंबरिंग", "Split & export":"स्प्लिट और एक्सपोर्ट",
    "Redaction":"रिडाक्शन", "Document & self-test":"डॉक्यूमेंट और सेल्फ-टेस्ट",
    "Form fields":"फॉर्म फील्ड्स", "Signature":"सिग्नेचर", "Network":"नेटवर्क",
    "Text":"टेक्स्ट", "Size":"साइज़", "Opacity":"ओपेसिटी", "Angle":"एंगल",
    "Position":"पोज़िशन", "Colour":"कलर", "Format":"फॉर्मेट", "Start at":"से शुरू करें",
    "Title":"टाइटल", "Author":"ऑथर", "Subject":"सब्जेक्ट", "Keywords":"कीवर्ड्स",
    "Mode":"मोड", "Resolution":"रिज़ॉल्यूशन", "JPEG quality":"JPEG क्वालिटी",
    "User password":"यूज़र पासवर्ड", "Owner password":"ओनर पासवर्ड", "Password":"पासवर्ड",
    "Language":"लैंग्वेज", "Trim edges":"किनारे काटें", "Page size":"पेज का साइज़",
    "Layout":"लेआउट", "Gap":"गैप", "Top left":"ऊपर बाएँ", "Top centre":"ऊपर बीच",
    "Top right":"ऊपर दाएँ", "Bottom left":"नीचे बाएँ", "Bottom centre":"नीचे बीच",
    "Bottom right":"नीचे दाएँ", "Prefix":"प्रीफिक्स", "Digits":"अंक",
    "Split by":"इनके हिसाब से बाँटें", "Ranges":"रेंज", "Image DPI":"इमेज DPI",
    "Words":"शब्द", "Width":"चौड़ाई", "Drop PDFs or images here":"यहाँ PDFs या इमेज ड्रॉप करें",
    "Help":"मदद", "Centre":"सेंटर", "Tiled":"टाइल",
    "photos only — keeps text":"सिर्फ फोटो — टेक्स्ट को बनाए रखता है",
    "every page — rasterise":"हर पेज — रास्टराइज़", "keep original":"ओरिजिनल बनाए रखें",
    "A4 portrait":"A4 पोर्ट्रेट", "A4 landscape":"A4 लैंडस्केप", "Letter portrait":"लेटर पोर्ट्रेट",
    "2 per sheet":"1 शीट में 2", "4 per sheet":"1 शीट में 4", "booklet (2-up)":"बुकलेट (2-अप)",
    "every N pages":"हर N पेज पर", "one file per page":"हर पेज के लिए एक फ़ाइल", "ranges":"रेंज",
    "+ Add PDFs":"+ PDF जोड़ें", "+ Add images":"+ इमेज जोड़ें", "Save my data":"मेरा डेटा सेव करें",
    "Restore":"रिस्टोर करें", "Undo":"अनडू करें",
    "no pages yet":"अभी तक कोई पेज नहीं", "selected":"चुना गया"
  },
  gu: {
    "Save PDF":"PDF સેવ કરો", "Pages":"પેજ", "Tools":"ટૂલ્સ", "Select all":"બધું પસંદ કરો",
    "Clear":"ક્લિયર કરો", "Duplicate":"ડુપ્લિકેટ કરો", "Insert blank":"ખાલી પેજ ઉમેરો",
    "Delete":"ડિલીટ કરો", "Extract to new PDF":"નવી PDF માં એક્સટ્રેક્ટ કરો",
    "Clear all":"બધું ક્લિયર કરો", "Reset tools":"ટૂલ્સ રિસેટ કરો",
    "Choose a PDF…":"PDF પસંદ કરો…", "Extract text":"ટેક્સ્ટ એક્સટ્રેક્ટ કરો",
    "Load engine":"એન્જિન લોડ કરો", "Close":"બંધ કરો", "Split now":"અત્યારે સ્પ્લિટ કરો",
    "Export pages as PNG":"પેજને PNG તરીકે એક્સપોર્ટ કરો",
    "Run self-test":"સેલ્ફ-ટેસ્ટ રન કરો", "Find fields":"ફિલ્ડ્સ શોધો",
    "Load a picture…":"ફોટો લોડ કરો…", "Extract images":"ઇમેજ એક્સટ્રેક્ટ કરો",
    "Files":"ફાઇલ્સ", "Watermark":"વોટરમાર્ક", "Page numbers":"પેજ નંબર",
    "Metadata":"મેટાડેટા", "Compress":"કમ્પ્રેસ કરો",
    "Password protect":"પાસવર્ડ પ્રોટેક્ટ કરો", "Unlock a PDF":"PDF અનલોક કરો",
    "OCR":"OCR", "Document":"ડોક્યુમેન્ટ", "Credits & licences":"ક્રેડિટ્સ અને લાયસન્સ",
    "Page size & trim":"પેજ સાઇઝ અને ટ્રિમ", "Impose (N-up)":"ઇમ્પોઝ (N-up)",
    "Header & footer":"હેડર અને ફૂટર", "Bates numbering":"બેટ્સ નંબરિંગ",
    "Split & export":"સ્પ્લિટ અને એક્સપોર્ટ", "Redaction":"રેડક્શન",
    "Document & self-test":"ડોક્યુમેન્ટ અને સેલ્ફ-ટેસ્ટ", "Form fields":"ફોર્મ ફિલ્ડ્સ",
    "Signature":"સિગ્નેચર", "Network":"નેટવર્ક", "Text":"ટેક્સ્ટ", "Size":"સાઇઝ",
    "Opacity":"ઓપેસિટી", "Angle":"એંગલ", "Position":"પોઝિશન", "Colour":"કલર",
    "Format":"ફોર્મેટ", "Start at":"આનાથી શરૂ કરો", "Title":"ટાઇટલ", "Author":"ઓથર",
    "Subject":"સબ્જેક્ટ", "Keywords":"કીવર્ડ્સ", "Mode":"મોડ", "Resolution":"રિઝોલ્યુશન",
    "JPEG quality":"JPEG ક્વોલિટી", "User password":"યુઝર પાસવર્ડ",
    "Owner password":"ઓનર પાસવર્ડ", "Password":"પાસવર્ડ", "Language":"ભાષા",
    "Trim edges":"કિનારીઓ કાપો", "Page size":"પેજનું કદ", "Layout":"લેઆઉટ", "Gap":"અંતર",
    "Top left":"ઉપર ડાબે", "Top centre":"ઉપર વચ્ચે", "Top right":"ઉપર જમણે",
    "Bottom left":"નીચે ડાબે", "Bottom centre":"નીચે વચ્ચે", "Bottom right":"નીચે જમણે",
    "Prefix":"પ્રીફિક્સ", "Digits":"અંકો", "Split by":"આનાથી અલગ કરો", "Ranges":"રેન્જ",
    "Image DPI":"ઇમેજ DPI", "Words":"શબ્દો", "Width":"પહોળાઈ",
    "Drop PDFs or images here":"અહીં PDFs અથવા ઇમેજ મૂકો", "Help":"મદદ", "Centre":"સેન્ટર",
    "Tiled":"ટાઇલ્ડ", "photos only — keeps text":"માત્ર ફોટા — ટેક્સ્ટ જાળવી રાખે છે",
    "every page — rasterise":"દરેક પેજ — રાસ્ટરાઇઝ કરો", "keep original":"મૂળ જાળવી રાખો",
    "A4 portrait":"A4 પોટ્રેટ", "A4 landscape":"A4 લેન્ડસ્કેપ", "Letter portrait":"લેટર પોટ્રેટ",
    "2 per sheet":"શીટ દીઠ 2", "4 per sheet":"શીટ દીઠ 4", "booklet (2-up)":"બુકલેટ (2-અપ)",
    "every N pages":"દર N પેજ", "one file per page":"દરેક પેજ માટે એક ફાઇલ", "ranges":"રેન્જ",
    "+ Add PDFs":"+ PDF ઉમેરો", "+ Add images":"+ ઇમેજ ઉમેરો", "Save my data":"મારો ડેટા સેવ કરો",
    "Restore":"રિસ્ટોર", "Undo":"અનડૂ",
    "no pages yet":"અત્યાર સુધી કોઈ પેજ નથી", "selected":"પસંદ કરેલ"
  }
};
const LANG_ORDER = ['en', 'hi', 'gu'];
const LANG_LABEL = {en:'EN', hi:'हिं', gu:'ગુ'};
const LANG_HTML  = {en:'en', hi:'hi', gu:'gu'};
let LANG = 'en';
const i18nNodes = new Map();   // text node -> its English original

function t(s){
  const table = I18N[LANG];
  return (table && table[s]) || s;
}

function i18nCollect(){
  if(i18nNodes.size) return;
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while((n = walk.nextNode())){
    const v = n.nodeValue.trim();
    if(v && (I18N.hi[v] || I18N.gu[v])) i18nNodes.set(n, n.nodeValue);
  }
}
function i18nApply(){
  i18nCollect();
  i18nNodes.forEach((orig, node) => {
    const key = orig.trim();
    const table = I18N[LANG];
    const tr = table && table[key];
    node.nodeValue = tr ? orig.replace(key, tr) : orig;
  });
  document.documentElement.lang = LANG_HTML[LANG] || 'en';
  // the page counter is built at runtime, so refresh it in the new language
  try{ if(typeof updateBar === 'function') updateBar(); }catch(e){}
  const btn = $('#lang');
  if(btn){
    btn.textContent = LANG_LABEL[LANG];
    btn.title = LANG === 'en' ? 'Interface language' : 'भाषा / ભાષા';
    btn.setAttribute('aria-label', 'Interface language: ' + LANG);
  }
}
function setLang(l){
  LANG = LANG_ORDER.indexOf(l) >= 0 ? l : 'en';
  LS.set('lang', LANG);
  i18nApply();
}
function cycleLang(){
  const next = LANG_ORDER[(LANG_ORDER.indexOf(LANG) + 1) % LANG_ORDER.length];
  setLang(next);
  toast(next === 'en' ? 'Language: English' : next === 'hi' ? 'भाषा: हिन्दी' : 'ભાષા: ગુજરાતી');
}
function initI18n(){
  const head = document.querySelector('header');
  if(head && !$('#lang')){
    const b = document.createElement('button');
    b.className = 'hbtn'; b.id = 'lang'; b.textContent = 'EN';
    b.onclick = cycleLang;
    const theme = $('#theme');
    if(theme && theme.parentNode) theme.parentNode.insertBefore(b, theme);
    else head.appendChild(b);
  }
  setLang(LS.get('lang', 'en'));
}
