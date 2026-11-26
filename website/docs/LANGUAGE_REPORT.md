# BizKhata AI — Language-wise Test Report (UPDATE 13)

Measured by `tests/language.test.mjs` (run with `npm test`). Every language is tested on the same 8 dimensions: detection, Romanized multi-service entry, native-script entry, number words / native digits, spelling-variant today word, mixed-language follow-up, profit Q&A with a real figure (₹200.00), and yes/no confirmation words. Plus global checks: the 10 brief examples, the Gujarati end-to-end flow, language switching, duplicate prevention and voice-to-text style input.

**Overall multilingual accuracy: 204/204 (100.0%)**
**Detection: exact language 12/23; script/language family 23/23.**

## Per-language results

| Language | Code | Checks | Accuracy | Detection | Notes / limitations |
|---|---|---|---|---|---|
| English | en | 8/8 | 100.0% | Exact | Full support, including English number words (two hundred). |
| Hindi | hi | 8/8 | 100.0% | Exact | Full support. Devanagari is shared with Marathi/Nepali/Sanskrit/Dogri/Maithili/Bodo/Konkani, so detection by script alone resolves to Hindi unless marker words disambiguate; parsing is unaffected. |
| Gujarati | gu | 8/8 | 100.0% | Exact | Full support: native script + Gujarati digits, Roman Gujarati, mixed sentences, local words (aapvana, malyo, thaya, nakh de). |
| Marathi | mr | 8/8 | 100.0% | Family/script only | Roman Marathi and parsing fully work. Native Devanagari detection usually resolves to Hindi (shared script); replies then fall back to Hinglish — figures stay correct. |
| Bengali | bn | 8/8 | 100.0% | Exact | Full support. Bengali script is shared with Assamese/Manipuri; detection distinguishes them only by marker words. |
| Punjabi | pa | 8/8 | 100.0% | Exact | Full support: Gurmukhi script + digits, Roman Punjabi, hanji confirmation. |
| Tamil | ta | 8/8 | 100.0% | Exact | Full support for core flows. Some Tamil verb forms (aachu) are not yet in the vocabulary — sentences without a verb, or with hue/mila equivalents, work; add verb variants to extend. |
| Telugu | te | 8/8 | 100.0% | Exact | Full support: Telugu script + digits, Roman Telugu, avunu/ledu confirmation. |
| Kannada | kn | 8/8 | 100.0% | Exact | Full support: Kannada script + digits, Roman Kannada, haudu/illa confirmation. |
| Malayalam | ml | 8/8 | 100.0% | Exact | Full support: Malayalam script + digits, Roman Malayalam, athe/alla confirmation. |
| Odia | or | 8/8 | 100.0% | Exact | Full support: Odia script + digits, Roman Odia. |
| Assamese | as | 8/8 | 100.0% | Family/script only | Core flows work. Shares the Bengali script with Bengali/Manipuri, so exact detection relies on marker words (aji/kiman/ketiya); replies may fall back to Bengali/Hinglish wording with correct figures. |
| Urdu | ur | 8/8 | 100.0% | Exact | Full support: Arabic script + Urdu digits, Roman Urdu. Arabic script is shared with Kashmiri/Sindhi; detection resolves to the Urdu family. |
| Sanskrit | sa | 8/8 | 100.0% | Family/script only | LIMITED: formal Sanskrit vocabulary only (adya, labhah, vyayah). Everyday Hinglish-style Sanskrit is not covered, and Devanagari detection usually resolves to Hindi. Parsing of core amounts/services works. |
| Kashmiri | ks | 8/8 | 100.0% | Family/script only | LIMITED: thin Kashmiri vocabulary (az, kith, chhu). Arabic-script detection resolves to the Urdu family; core amounts/services parse correctly. |
| Konkani | kok | 8/8 | 100.0% | Family/script only | Core flows work via shared Hindi/Marathi words. Distinct Konkani markers are few, so detection usually resolves to Hindi/Marathi; parsing is unaffected. |
| Nepali | ne | 8/8 | 100.0% | Family/script only | Core flows work. Devanagari detection usually resolves to Hindi (shared script); replies fall back to Hinglish with correct figures. |
| Sindhi | sd | 8/8 | 100.0% | Family/script only | LIMITED: thin Sindhi vocabulary. Arabic-script detection resolves to the Urdu family; core amounts/services parse correctly. |
| Manipuri (Meitei) | mni | 8/8 | 100.0% | Family/script only | LIMITED: thin Meitei vocabulary (ngasi, kari). Bengali-script form shares detection with Bengali/Assamese; Meetei Mayek script is detected, core flows work. |
| Bodo | brx | 8/8 | 100.0% | Family/script only | LIMITED: thin Bodo vocabulary (dinwi, bese). Devanagari detection usually resolves to Hindi; core amounts/services parse correctly. |
| Dogri | doi | 8/8 | 100.0% | Family/script only | Core flows work via shared Punjabi/Hindi words. Detection usually resolves to Hindi/Punjabi (shared words + Devanagari). |
| Maithili | mai | 8/8 | 100.0% | Family/script only | Core flows work via shared Hindi words. Detection usually resolves to Hindi (shared script + vocabulary). |
| Santali | sat | 8/8 | 100.0% | Exact | LIMITED: thin Santali vocabulary (tihin, tinag, chet). Ol Chiki script + digits are detected; core amounts/services parse correctly. Romanized Santali beyond the core words is not yet covered. |

## How detection works — and its honest limit

Languages that share a script cannot be told apart by script alone: Devanagari (Hindi, Marathi, Nepali, Sanskrit, Dogri, Maithili, Bodo, Konkani), Bengali script (Bengali, Assamese, Manipuri) and Arabic script (Urdu, Kashmiri, Sindhi). The detector therefore combines script detection with Romanized/native marker-word scoring; when markers are absent it reports the family (e.g. Hindi for a Devanagari message). **Parsing and figures are unaffected** — the normaliser maps every language's words to the same canonical tokens, so a Marathi or Nepali message is understood even when the reply falls back to Hinglish wording. The reply language can also be fixed manually in Settings → Language → "AI Assistant language".

## What the vocabulary system covers

Data-driven tables in `src/lib/languages.ts` (`VOCAB_ENTRIES`, `NUMBER_WORDS`, `DIGIT_MAP`): time words, question words, verbs, money/business nouns, expense words and service names in native script + Romanized + dialect spellings, plus digits in Devanagari, Gujarati, Bengali, Gurmukhi, Tamil, Telugu, Kannada, Malayalam, Odia, Arabic-Indic and Ol Chiki. To extend a language, add entries to those tables — no parser changes are needed.

## Known limitations (measured, not assumed)

- **Sanskrit, Kashmiri, Bodo, Santali, Sindhi, Manipuri:** thin vocabularies — core amounts, services, today/profit/due words work; everyday sentences outside the core words fall back to clarification drafts instead of being guessed.
- **Tamil verb forms:** some forms (e.g. "aachu") are not yet in the vocabulary; sentences without a verb, or with hue/mila equivalents, work.
- **Agent payable without a job:** "Agent ko 500 dena baki hai" asks which agent, then asks for the job/service — payable lives on jobs, so the assistant never invents a payable entry from a bare amount.
- **Voice input:** Web Speech API language tags exist for all 23 languages; actual recognition accuracy depends on the browser/device and was not measured here (no microphone in the test environment).
- **Replies:** the factual/Q&A answers are localised for all 23 languages; the longer knowledge answers (comparisons, analysis, app help) reply in Hinglish/English with correct figures when the detected language is not Hindi/English.

## Regressions

Existing suites stay green: accounting 52/52, assistant 100/100, AI 63/63.
