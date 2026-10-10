/**
 * Callers mix Hindi and English, and the speech-to-text often writes everything in Devanagari
 * ("मेरा 3 बीएचके बानेर में है, बजट 20 लाख"). The extractor reads English, so caller text is
 * normalised first: known phrases → English, Devanagari digits → 0-9, Hindi number words → digits,
 * then everything else is transliterated to Latin script. The original text is kept for display.
 */

const PHRASES: [RegExp, string][] = [
  // names & greetings
  [/मेरा\s+नाम\s+/g, " my name is "],
  // money
  [/करोड़|करोड/g, " crore "], [/लाख|लाख़|लाक/g, " lakh "], [/हज़ार|हजार/g, " thousand "], [/बजट/g, " budget "], [/रुपये|रुपए|रूपए/g, " rupees "],
  // area
  [/स्क्वायर\s*फी?ट|स्क्वेयर\s*फी?ट|स्क्वेयर\s*फुट|स्क्वायर\s*फुट|वर्ग\s*फुट|स्क्वेर\s*फीट/g, " square feet "], [/कार्पेट/g, " carpet "], [/एरिया/g, " area "],
  // property / scope
  [/बी\s*एच\s*के|बीएचके|बी\.एच\.के/g, " BHK "], [/बेडरूम/g, " bedroom "], [/फ्लैट/g, " flat "], [/अपार्टमेंट/g, " apartment "], [/विला/g, " villa "], [/बंगला/g, " bungalow "],
  [/पूरा\s+घर|पूरे\s+घर/g, " full home "], [/घर/g, " home "], [/ऑफिस|आफिस|ऑफ़िस|दफ्तर/g, " office "], [/किचन|रसोई/g, " kitchen "], [/मॉड्यूलर/g, " modular "],
  [/इंटीरियर्स?|इंटीरियर|इन्टीरियर/g, " interiors "], [/डिज़ाइन|डिजाइन/g, " design "], [/वार्डरोब|अलमारी/g, " wardrobe "], [/रेनोवेशन/g, " renovation "],
  [/पेंटिंग|पेंट/g, " painting "], [/वास्तु/g, " vastu "], [/आर्किटेक्ट/g, " architect "],
  // time
  [/अगले\s+महीने/g, " next month "], [/इस\s+महीने/g, " this month "], [/महीनों|महीने|महीना/g, " months "], [/हफ्ते|हफ़्ते|सप्ताह/g, " weeks "], [/साल/g, " year "],
  [/तुरंत|अभी/g, " immediately "], [/पज़ेशन|पजेशन|पोज़ेशन/g, " possession "], [/दिवाली/g, " Diwali "],
  // places (Pune)
  [/पुणे|पूना/g, " Pune "], [/बानेर|बाणेर/g, " Baner "], [/औंध/g, " Aundh "], [/कोथरूड/g, " Kothrud "], [/वाकड/g, " Wakad "], [/हिंजेवाड़ी|हिंजवडी|हिंजेवाडी/g, " Hinjewadi "],
  [/खराडी|खराड़ी/g, " Kharadi "], [/विमान\s*नगर/g, " Viman Nagar "], [/कोरेगांव\s*पार्क/g, " Koregaon Park "], [/हडपसर/g, " Hadapsar "], [/मगरपट्टा/g, " Magarpatta "],
  [/बावधन/g, " Bavdhan "], [/बालेवाड़ी|बालेवाडी/g, " Balewadi "], [/शिवाजीनगर/g, " Shivajinagar "], [/कल्याणी\s*नगर/g, " Kalyani Nagar "], [/वाघोली/g, " Wagholi "],
  [/पिंपरी|पिंपरी\s*चिंचवड/g, " Pimpri "], [/पिंपल\s*सौदागर/g, " Pimple Saudagar "], [/उंड्री/g, " Undri "], [/रावेत/g, " Ravet "], [/मुंबई/g, " Mumbai "], [/नासिक/g, " Nashik "],
  // intent
  [/कीमत|दाम|कितना\s+खर्च|कितना\s+लगेगा|प्राइस|कॉस्ट/g, " what does it cost "], [/फाइनल\s+कोट|फ़ाइनल\s+कोट/g, " final quote "], [/हाँ|हां|जी\s+हाँ/g, " yes "], [/नहीं/g, " no "],
];

const NUM_WORDS: [RegExp, string][] = [
  [/डेढ़/g, "1.5"], [/ढाई/g, "2.5"], [/एक/g, "1"], [/दो/g, "2"], [/तीन/g, "3"], [/चार/g, "4"], [/पांच|पाँच/g, "5"], [/छह|छः/g, "6"], [/सात/g, "7"], [/आठ/g, "8"], [/नौ/g, "9"],
  [/दस/g, "10"], [/बारह/g, "12"], [/पंद्रह/g, "15"], [/बीस/g, "20"], [/पच्चीस/g, "25"], [/तीस/g, "30"], [/चालीस/g, "40"], [/पचास/g, "50"], [/सौ/g, "100"],
];

const DIGITS = "०१२३४५६७८९";
const VOWELS: Record<string, string> = { अ: "a", आ: "aa", इ: "i", ई: "ee", उ: "u", ऊ: "oo", ऋ: "ri", ए: "e", ऐ: "ai", ओ: "o", औ: "au", ऑ: "o", ॲ: "e" };
const SIGNS: Record<string, string> = { "ा": "aa", "ि": "i", "ी": "ee", "ु": "u", "ू": "oo", "ृ": "ri", "े": "e", "ै": "ai", "ो": "o", "ौ": "au", "ॉ": "o", "ॅ": "e", "ं": "n", "ँ": "n", "ः": "h" };
const CONS: Record<string, string> = {
  क: "k", ख: "kh", ग: "g", घ: "gh", ङ: "n", च: "ch", छ: "chh", ज: "j", झ: "jh", ञ: "n", ट: "t", ठ: "th", ड: "d", ढ: "dh", ण: "n",
  त: "t", थ: "th", द: "d", ध: "dh", न: "n", प: "p", फ: "ph", ब: "b", भ: "bh", म: "m", य: "y", र: "r", ल: "l", व: "v", श: "sh", ष: "sh", स: "s", ह: "h", ळ: "l",
  क़: "q", ख़: "kh", ग़: "gh", ज़: "z", ड़: "d", ढ़: "dh", फ़: "f",
};

function transliterate(s: string): string {
  let out = "";
  const ch = [...s.normalize("NFC")];
  for (let i = 0; i < ch.length; i++) {
    const c = ch[i], n = ch[i + 1];
    if (CONS[c]) {
      out += CONS[c];
      if (n === "्") { i++; continue; }          // halant: no inherent vowel
      if (n && SIGNS[n]) continue;                 // vowel sign follows
      const end = !n || /[\s.,!?]/.test(n);
      if (!end) out += "a";                        // inherent 'a', dropped at word end (schwa deletion)
    } else if (SIGNS[c]) out += SIGNS[c];
    else if (VOWELS[c]) out += VOWELS[c];
    else if (c === "़" || c === "्") continue;
    else if (c === "।") out += ".";
    else out += c;
  }
  return out;
}

export function hasDevanagari(s: string) { return /[ऀ-ॿ]/.test(s); }

/** English-readable version of a Hindi / Hinglish utterance, for extraction only. */
export function normaliseIndic(text: string): string {
  if (!hasDevanagari(text)) return text;
  let t = text.replace(/[०-९]/g, (d) => String(DIGITS.indexOf(d)));
  for (const [re, en] of PHRASES) t = t.replace(re, en);
  for (const [re, n] of NUM_WORDS) t = t.replace(new RegExp(`(^|\\s)${re.source}(?=\\s|$)`, "g"), `$1${n}`);
  t = t.replace(/(\d+(?:\.\d+)?)\s+100(?=\s|$)/g, (_, n) => String(Math.round(Number(n) * 100)));
  t = transliterate(t);
  // "3 BHK", "20 lakh": glue numbers to units the extractor expects
  t = t.replace(/(my name is \S+?)[.,]?\s+(?:hai|hain|ji|hoon|hun|hoo)\b/gi, "$1");
  return t.replace(/\s{2,}/g, " ").replace(/\s+([.,!?])/g, "$1").trim();
}
