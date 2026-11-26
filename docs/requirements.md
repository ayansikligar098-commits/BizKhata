# BizKhata — Business Management, Accounting & CSC Application
## App name confirmed 2026-11-26: BizKhata (business profile inside: Al Falah Communication — CSC Center)
## Complete Requirements Record — 26 November 2026

Source: ayan's consolidated discussion record, received 2026-11-26 (Sections 1–28, complete). Plus the original ChatGPT conversation "App Prompt Planning" (https://chatgpt.com/share/6b082e80-c34c-83e8-ac4d-8a2232dfed40), read from the start on 2026-11-26: all 62 user messages read in full; only 1 ChatGPT reply was readable in the shared view, the other 61 were hidden ("couldn't be displayed — open complete conversation", needs ChatGPT login, not signed in). So ChatGPT's draft prompt, its feature lists and its Sector/Section 28 text are NOT visible from that link — the requirements below come from ayan's own words in both places.
Status: **ON HOLD — do not start building until ayan says so.**

## 0. Origin — why this app exists
Core problem in ayan's own words: dukaan me paise spend me locha hota hai, pata hi nahi chalta paise kahan chale jate hain. Money Transfer fund comes from his brother; after 1–2 days the hisab goes wrong. Every job must have a separate hisab and separate money, trackable in the app, so no money goes missing.
- He asked ChatGPT to listen to everything first, then give a prompt for Muse — NOT to build the app itself.
- Labels/names must be simple: not so difficult English that a person who knows only a little English gets confused.
- Daily Dhandha must show online payment received that day, and profit split by Xerox / Money Transfer / other document work.
- Document upload per customer: as many as he wants, unlimited.
- He liked design/option "2" in the ChatGPT chat ("2 Sahi Lag Rha Hai") — what "2" was is hidden in the shared view (reply/image not displayable), as is the image he uploaded and the ChatGPT-generated Al Falah image.
- Language in that chat: first "English hi rahegi", then changed to a language option — proper English + Hinglish, chosen after login.
- Free, for his own use for now — but every business should be able to use it, category-wise.
- No tech stack appears in the readable part of the ChatGPT chat — Kotlin/Compose/Firebase/backend choices there are not established from that source.

## 1. Idea
Professional Business Management & Accounting app. Not just an income/expense tracker — complete business operations, service-wise accounting, customers, agents, payments, documents, profit, reports, customization. Initial focus: CSC Center / Cyber Cafe (Al Falah Communication). Future: other business types.

## 2. Development approach — Android first, website second
- Android first, native coding only. No HTML / WebView Android app.
- Professional developer-level UI/UX.
- Website only after Android is complete and tested.
- Android and website share the same backend and database.
- Android: Kotlin, Jetpack Compose, Material 3, native.
- Website: React / Next.js, TypeScript.
- Backend: shared API, secure auth, central database, reliable sync.
- Database: PostgreSQL (discussed as suitable option).

## 3. Business categories (selected at signup)
1. Cyber Cafe / CSC Center, 2. Mobile Shop, 3. Grocery / Kirana, 4. Clothing Store, 5. Electronics Shop, 6. Printing Shop, 7. Hardware Shop, 8. Medical Store, 9. Restaurant / Cafe, 10. Salon, 11. Automobile / Garage, 12. Wholesale Business, 13. General Retail, 14. Service Business, 15. Other Business.
- Each category gets a complete ready-made setup: its own dashboard config, modules, workflows, income/expense categories, customer/supplier management, reports, profit rules, customizable fields.
- CSC → PAN, Aadhaar, Voter ID, Ayushman, Xerox, Printing, etc. Grocery → products, stock, suppliers, customer credit, stock alerts.
- User can add new categories, services, fields.

## 4. Multiple business profiles
- One account (Gmail / mobile) → initially 2–3 separate business profiles (e.g. Al Falah Communication, Mobile Shop, another). Limit configurable later.
- Each profile fully separate: dashboard, category, customers, Khata, agents, agent ledger, cash, UPI, Money Transfer, income, expenses, services, documents, receipts, reports, customizations.
- Profile switcher switches the entire accounting environment. Never mix records between profiles.

## 5. Login & language
- After successful login: language selection screen. Languages: English (default), Hindi, Hinglish.
- English: proper professional English, simple understandable labels. Hinglish: natural Hindi-English mix. Hindi: proper Hindi.
- Applies everywhere: Android + website, menus, buttons, forms, reports, notifications, receipts where applicable. Saved, changeable in Settings, synced across platforms.

## 6. Dashboard
- Today's Income, Today's Expenses, Net Profit, Cash Balance, UPI Balance, Customer Due, Agent Payable, Service-wise Income, Recent Transactions, Recent Customers, Pending Payments, Daily Business Summary.
- Charts: Daily Income, Daily Expenses, Profit, Service-wise Earnings, Cash vs UPI, Weekly, Monthly.
- Customizable. Billing, actual collection, outstanding, payable, balance and profit are DIFFERENT figures — never mix them.

## 7. CSC modules (each with its own dedicated page)
Dashboard, Cash Book, UPI Book, Money Transfer, PAN Card, Aadhaar Services, Voter ID, Ayushman Card, Xerox, Printing, Smart Card, Document Work, Customers, Customer Khata, Agent Management, Agent Payments, Expenses, Machine Maintenance, Receipts, Daily Business, Reports, Settings. No crowded single screen.

## 8. Service-wise accounting
Per service (PAN, Aadhaar, Xerox, Printing, Smart Card, Voter ID, Ayushman, Document Work, Money Transfer): Total Billing, Amount Received, Cash Received, UPI Received, Pending Customer Due, Direct Expenses, Agent Charges, Actual Profit. Daily / weekly / monthly / yearly reports.

## 9. Customer management — service-wise
- PAN customers on PAN page only, Aadhaar on Aadhaar page only, etc. Xerox/Printing customers in their modules. Never one mixed list.
- One customer may use multiple services → common customer identity, separate job records per service, linkable without mixing job histories.
- Customer profile: Name, Mobile, Customer ID, Service Type, Work Details, Application Reference Number, Submission Date, Work Status, Total Fees, Amount Received, Remaining Amount, Payment History (Cash/UPI), Document History, Notes, Assigned Agent, Delivery Status.
- Each job: its own record and financial calculation.

## 10. Document upload
- Multiple uploads per customer and per job: PDF, JPG, JPEG, PNG, other formats.
- Preview, download, name, category, upload date, notes, replace, delete, history, link to a specific job.
- Organized by service and job — no single unorganized folder. Private encrypted storage, access controls, retention controls, secure deletion. For Aadhaar/sensitive IDs: minimize collection/storage, mask sensitive numbers, follow legal/security requirements.

## 11. Customer Khata
- Individual payment ledger per customer: advance, partial, full, cash, UPI, other methods, payment history, date-wise records, pending reports, reminders, receipt generation.
- Example: bill ₹500, received ₹200 cash → due ₹300; only ₹200 increases cash/UPI balance. Outstanding is NEVER treated as received money.

## 12. Agent management
- Shop receives customer work, assigns backend work to an outside agent, receives completed work, delivers/prints to customer.
- Outsourced: Aadhaar Name Correction, Mobile Number Update, Biometric Work, Aavak Dhakla, Licence-related work, other agent services.
- **PAN is handled by ayan himself — do NOT make PAN an outsourced service.**
- Agent profile: Name, Mobile, Contact Details, Agent Type, Required Agent Documents, Notes, Status. Custom agent types allowed.
- Agent page: assigned customers, work details, category, date assigned, status, agent charges, amount paid, remaining payable, payment history, completed/pending/rejected jobs.
- Example: total agent charges ₹800, paid ₹500 → payable ₹300. Agent payable is separate from customer receivable (e.g. customer due ₹500, agent payable ₹300 — separate ledgers).
- Workflow: receive job → assign agent → enter charges → update status → receive completed work → deliver to customer → record agent payment.

## 13. Expenses & equipment
- Equipment: Xerox Machine, Epson Printer, other printers, Computer, Scanner.
- Categories: Machine Repair, Printer Repair, Servicing, Ink, Toner, Cartridge, Paper, Printhead, Spare Parts, Electricity, Internet, Rent, Staff, Transport, Other.
- Per expense: category/equipment, description, amount, date, Cash/UPI, vendor, bill/invoice attachment, notes.
- Individual equipment history page (e.g. Epson L805: ink, printhead repair, servicing, spares, total lifetime cost). Equipment-wise, category-wise, daily/monthly/yearly reports. Direct costs linked to the relevant service for accurate profit; shared expenses kept separately identifiable.

## 14. Receipt & invoice generator
- Auto-filled from business profile: Business Name, Logo, Address, Mobile, other details.
- Receipt: unique number, date/time, customer name, mobile, service details, total fees, amount paid, remaining amount, payment method, notes.
- Professional commercial-invoice look. PDF download, Print, WhatsApp Share, Duplicate Receipt, Receipt History. A4 and thermal layouts. Paid vs Due clearly distinguishable.

## 15. Hisab Difference Finder / reconciliation
- Enter expected balance, compare with recorded balance (e.g. expected ₹25,000 vs recorded ₹23,500 → difference ₹1,500; also example ₹5,000 vs ₹4,800 → ₹200).
- Investigate: missing entries, duplicates, wrong amounts, wrong payment modes, wrong dates, wrong opening/closing balances, cash/UPI mismatches.
- Suggest possible matching transactions and explain why they may relate — NEVER auto-assume a suggestion is the mistake, NEVER auto-modify entries. Manual correction only, with confirmation and audit trail.
- Separate tools for: General Shop Accounting, Cash, UPI, Money Transfer, Individual Services. Money Transfer investigation uses only its own ledger unless user explicitly asks broader. Support date ranges, accounts, filters, transaction evidence — the difference amount alone cannot always identify the error.

## 16. Edit / delete / restore / audit log
- Add, View, Edit, Delete, Restore, Search, Filter, Export. Recycle Bin for recoverable deletes. No silent erasure of financial data.
- Audit logs: who created/edited/deleted, previous value, new value, date/time, restoration history. Soft deletion + controlled permanent deletion. Confirmation before destructive actions. No silent rewriting of historical financial records.

## 17. Customization Studio
- Add services, income categories, expense categories, custom pages/modules, custom customer fields, custom transaction fields; enable/disable modules; hide/show dashboard cards; arrange widgets; customize navigation, receipt branding, reports, profit rules where supported.
- Per business profile — customization in one profile must not affect another, and must not corrupt historical transactions. Restore-default option.

## 18. Money Transfer accounting (independent)
- Separate module, never mixed with PAN/Aadhaar/Xerox/Printing/general shop accounting.
- Sections: Dashboard, Cash Book, UPI Book, Other Online Payments, Transactions, Other Expenses, Daily Closing, Difference Finder, Reports.
- Track: Starting Cash, Starting UPI, Funds received, Cash received, UPI received, Transfer amount, Transfer charges, Commission earned, Cash sent, UPI sent, Other expenses, Pending settlements, Closing Cash, Closing UPI, Actual balance.
- Per transaction: Transaction ID, date/time, amount, customer/receiver name, mobile, payment method (Cash/UPI), status, reference number, commission, notes.
- Custom expense categories (Tea/Food, Transport, Staff, Shop, Miscellaneous).
- Cash-to-UPI and UPI-to-Cash = internal transfers, NOT income/expenses. Profit = actual commission + applicable charges only — NEVER the full transferred principal. Example: transfer ₹10,000, commission ₹50 → profit is from the ₹50, not ₹10,000.
- Complete history + daily closing.

## 19. Financial reporting
Daily, Weekly, Monthly, Yearly, Custom Date, Income, Expense, Profit, Cash, UPI, Service-wise, Customer Due, Agent Payable, Money Transfer, Machine Maintenance reports. Easy to understand, financial values clearly distinguished.

## 20. Design & UI/UX
- Premium commercial accounting product look — NOT an ordinary expense tracker.
- Modern professional dashboard, clean layout, proper spacing, consistent typography, Material 3, professional colors, clear navigation, useful icons, readable cards, proper forms, search/filters, Light + Dark + System theme, responsive, proper loading/empty/error/success states.
- Every module its own dedicated page; each screen designed for its actual purpose (PAN screen shows PAN work, etc.) — no generic copy-paste layout everywhere.
- **UI reference images:** high-quality screen design images to give to the coding agent. Start with Dashboard, then other screens. Images are visual references only — actual functionality is native Kotlin + Jetpack Compose.
- Simple UX for ordinary shopkeepers: simple labels, clear buttons, big touch-friendly controls, helpful validation, confirmation dialogs, clear errors, simple charts, short instructions. Use Add/Edit/Delete, Payment Received, Payment Remaining, Total Income, Total Expenses, Reports, Check Balance. No unnecessary accounting jargon. Powerful backend, simple front end.

## 21. Settings
Profile, Business Profile, Language, Theme, Account, Business Information, Receipt Settings, Dashboard Customization, Service Settings, Categories, Data Management, Backup, Privacy, Security, App Information, Support. No incomplete/placeholder settings.

## 22. Security & data protection
Secure auth, business-wise data isolation (tenant isolation — one owner cannot access another's data), private document storage, access control, secure APIs, sensitive data protection, audit logs, backups, recovery, session management. Identity documents never publicly accessible.

## 23. Monetization & future SaaS
- Initial version: personal use, free. NO subscription / payment gateway now.
- Architecture must support future multi-tenant SaaS without rebuilding: Registered Users, Business Profiles, User Management, Subscription Management, Free/Premium plans if introduced later, Platform Analytics, Notifications, Feature Availability, Maintenance Mode, Support Management. Admin panel for platform level.

## 24. Previous project context — Link To QR (context only)
- Native Android: Kotlin 2.0.21, Jetpack Compose, Compose UI/Foundation/Runtime 1.7.6, Material 3 1.3.1, Activity 1.9.3, Lifecycle 2.8.3.
- UI, Settings, Account, Google Sign-In, Firebase, Firestore rules, backend work done. G3 Google Sign-In verification PASS. G4.1 complete, G4.2 not started (per previous project notes).
- **This is previous-project context only. Do NOT treat it as already implemented in the new Business app.**

## 25. Accounting examples (must hold)
1. Customer: total ₹500, received ₹200 → due ₹300; cash/UPI received = ₹200 only.
2. Agent: customer due ₹500, agent payable ₹300 — separate ledgers.
3. Money Transfer: transfer ₹10,000, commission ₹50 → profit from commission only.
4. Cash→UPI ₹1,000: internal movement only, not income/expense.
5. Service expense (e.g. ink for Printing) linked to that service → accurate service profit.

## 26. Roadmap
- Phase 1: Foundation — architecture, Android setup, backend, DB design, auth, business profiles, language, category setup.
- Phase 2: Main UI — Dashboard, navigation, business switcher, settings, theme, main modules.
- Phase 3: Business Operations — Cash Book, UPI Book, Money Transfer, Services, Customers, Khata, Agents, Agent Payments.
- Phase 4: Advanced — Documents, Expenses, Machine Maintenance, Receipts, Difference Finder, Reports, Customization, Audit Logs, Restore.
- Phase 5: Testing & Stability — financial calculations, profile isolation, customer/agent ledgers, documents, sync, UI, error handling, security.
- Phase 6: Website — after Android complete: frontend, shared backend/auth/DB, responsive, dashboard + all relevant modules.

## 27. Development rules (non-negotiable)
1. Do not remove any confirmed requirement without permission.
2. Do not silently change accounting rules.
3. Do not use dummy data as real financial data.
4. Do not create buttons without functionality.
5. Do not leave incomplete placeholder screens.
6. Do not mix different business profiles.
7. Do not mix customer outstanding with actual received money.
8. Do not mix agent payable with customer receivable.
9. Do not count Money Transfer principal as profit.
10. Do not count internal cash-to-UPI transfers as income.
11. Maintain transaction history.
12. Support record correction and audit history.
13. Protect customer documents.
14. Use proper validation.
15. Test financial calculations before considering a module complete.
16. Keep Android native.
17. Develop website separately using the shared backend.
18. Keep the system expandable for future business categories.

## 28. Items that still need final confirmation (PENDING — do NOT implement assumptions as confirmed requirements without approval)
1. Multiple Business Categories: Can one business profile contain multiple business categories, or should every category have a separate business profile?
2. Backend Infrastructure: Which backend hosting provider and infrastructure should be used?
3. Database and API Architecture: Finalize the database schema, API structure and backend architecture.
4. Offline Functionality: Should users be able to add transactions without an internet connection and synchronize them automatically when the internet becomes available?
5. Backup and Export: Which backup and export formats should be supported? For example, PDF, Excel, CSV and database backup.
6. WhatsApp Reminders: Should customer payment reminders be sent manually through WhatsApp or automatically through an integrated service?
7. Inventory and Stock Management: Should inventory and stock management be included in the first version for retail businesses?
8. UI Branding: Finalize the application's design colors, fonts, logo and overall branding.
9. Website Launch: Should the website launch immediately after Android development or at a later stage?
10. Deployment Costs: Finalize the hosting, server, database and deployment costs.

## Appendix — Shared ChatGPT link record (Record B, read after login 2026-11-26)
**DISCARDED 2026-11-26 19:03 IST — the original chat was found and read (43 messages, first-to-last): it is CSC-only. Record B's retail + school content was ChatGPT's wrong reconstruction of that chat. Do NOT build anything from Record B — no school modules (attendance, library, fees, exams), no retail inventory/sales/purchase. Kept here only as a record of the mistake, so nobody re-adds it.**
This is a DIFFERENT compiled record from Record A above.
- Source: shared conversation "App Prompt Planning", https://chatgpt.com/share/6b082e80-c34c-83e8-ac4d-8a2232dfed40 — only 3 user messages + 3 ChatGPT replies. (1) Compile everything from the earlier "app wali chat" into one prompt, nothing missed. (2) "Ha Vo Sab". (3) "Muje Sector 28 Alag Se Copy Karke Do" — last message, reply repeats Section 28.
- The original "app wali chat" was NOT found in the signed-in ChatGPT account: Recents showed "No chats", searches for "App Prompt Planning" and "Muje App Banana Hai" returned No results.
- Record B master record, Sections 1–28 + Final Objective: app for Al Falah — retail and small clothing/footwear shops, inventory, customers, sales, profit, suppliers; later expanded to a complete business app. Tech: Android native Kotlin/Jetpack Compose/Material 3; website React/Next.js/TypeScript; shared API, secure auth, central DB, sync; PostgreSQL discussed. App name discussed: final "Al Falah Business", title "Al Falah". Categories: clothing, footwear, home appliances and other retail, with separate category management. Business profile/contact: owner name, phone, address, GST, bank account, UPI, social media, website. Roles: Admin, Manager, Sales Staff, Customer, Viewer (to finalise). Admin features: product/inventory, sales, purchase, customer, employee, reports, settings. Dashboards per role: sales, purchase, stock, revenue, customer, low-stock. School side: student features (timetable, attendance, marks, fees, notices, study material, exams, syllabus), biometric/selfie attendance (biometric, selfie, location, face recognition), library (issue/return, stock, membership, fines), student attendance reports, fee payment via UPI + fee history/structure, exams & results, notifications/announcements, WhatsApp/SMS/email/in-app communication + marketing. Core: product/inventory, sales, purchase, customers, suppliers, payments, reports, barcode scanning, multi-language. Requirements: languages Hindi/English/Urdu, light/dark theme, offline. UI/UX: professional design, Al Falah logo/colours/branding; UI design images as reference, dashboard first, visual refs only, native Kotlin/Compose implementation. AI features (future): chatbot, sales insights, demand prediction, customer recommendations, voice commands. Stages: MVP, Phase 1, 2, 3. Monetisation: personal use free, no subscription/payment gateway initially; later multi-tenant SaaS possible. Link To QR progress: Kotlin 2.0.21, Firebase, Firestore, Google Sign-In; G3 PASS, G4.1 complete, G4.2 not started. Launch: first Al Falah, then other businesses, then Play Store. Cloud/multi-device: central DB, online/offline sync, backup/restore. Final design decisions to finalise.
- Record B Section 28 (10 pending items, none confirmed): 1) final app name, 2) final language(s), 3) image style — AI-generated vs uploaded, 4) design option / dashboard choice, 5) pricing/monetisation, 6) roles/permissions, 7) backend/database + hosting/development costs, 8) MVP/Phase 1/2/3 priority, 9) website — build it or not, and its features, 10) AI features/future plans.
- NOT in Record B: no design option "2", no uploaded image, no generated image. Those must be in the original app chat, which was not recovered.
- Earlier signed-out read of the same link had claimed 62 user messages / 63 replies with CSC content — that does not match the login read. Do not rely on the 62/63 count. The CSC details in Record A come from ayan's own pasted document in this chat, not from the shared link.

---

## Appendix: Original ChatGPT chat — full read (2026-11-26 19:03 IST)

Source: same share URL https://chatgpt.com/share/6b082e80-c34c-83e8-ac4d-8a2232dfed40, tab ayan opened, read first-to-last by browser task browser-task:e0c4e867 (ran 18:49–19:03 IST). 43 user messages + replies. Full report: ~/workspace/agents/702ac013-1717-410f-9f95-3d195fe042a4/subagent-output/5921dfaa-bf50-49f8-93cb-93ec4fb67af3-result-6a15d1d3acde.txt

CORRECTION: This original chat is CSC-only for Al Falah Communication. NO school features, NO retail inventory/sales/purchase. Record B (retail + school) was ChatGPT's wrong reconstruction of this chat — discard it.

Key points (in order):
1. Opening: "Sun Muje Meri Dukan Ke Liye App Banana Hai / Dukan Me Paise Spend Me Locha Hota Hai Pata Hi Nahi Chlta Paise Kha Chale Jate Hai Uska Hisab Kar Saku Esa App Banana Hai Muse Se / Pahle Ek Sath Meri Baat Sun Lena Phir Muse Ka Prompt Dena"
2. Money Transfer fund comes from ayan's BROTHER, by UPI. Track: fund received, transferred, spent, balance left, per transaction.
3. Cash and UPI both, tracked separately.
4. PAN/Aadhaar fees, customer payment received, income per service, expenses, actual profit — separate.
5. Big app, many features — proper Shop Management + Accounting, not a simple expense tracker.
6. No HTML. Native Android Kotlin + Jetpack Compose, professional premium UI, full accounting.
7. Customer Khata: per customer, total / received / pending, partial payments, reminders. Pending is NOT cash until received. Example Rahul ₹1,500 / ₹1,000 / ₹500.
8. Agent: per agent profile + ledger. Example agent Rahul: PAN ₹500 + Aadhaar ₹300 = ₹800, paid ₹500, remaining ₹300. Documents sensitive — encrypted storage.
9. Agent model corrected: ayan brings customer, gives backend work to agent, agent does it, ayan prints + delivers, pays agent. Example: customer ₹500, agent ₹250, paid ₹150, remaining ₹100, margin ₹250. Separate ledgers.
10. Customer work tracking: per customer file — job, status, fees, received, remaining, agent, printing/delivery. Search/filter by name, mobile, service, date, pending.
11. Receipt ("Recipe"): shop name/logo/address/mobile auto, customer, service, total/paid/remaining, Cash/UPI, receipt number, date/time. PDF, WhatsApp, print, history, duplicate. PAID vs DUE clear.
12. Receipt must be professional/premium invoice, A4 + thermal, signature section, customisable branding.
13. Every hisab on a SEPARATE page — Dashboard, Cash Book, UPI Book, Money Transfer, Income, Expenses, Services, Customers, Khata, Agents, Agent Payments, Receipts, Reports.
14. 2–3 business profiles from one Gmail/mobile, fully separate data.
15. Summary doc (15 sections) + radio questions: offline+online [checked], owner-only [checked], automatic cloud backup [checked], Hindi+English [checked] — checked radios are NOT confirmed decisions; Section 28 still lists them pending.
16. Difference Finder: enter expected vs recorded (example ₹25,000 vs ₹23,500 = ₹1,500), suggest possible missing/duplicate/wrong-mode transactions, never auto-modify, manual correction + audit. Separate finder inside Money Transfer.
17. Money Transfer page = complete separate accounting: Cash/UPI/other expenses (Tea/Food, Transport, Staff, Shop, Misc), closing cash/UPI formulas, internal transfers not income/expense, daily closing.
18. Daily Dhandha page: today sales/income/expense/net profit, per-service breakdown, daily/weekly/monthly/yearly, billing vs received vs profit are different figures.
19. Machine/equipment expenses: Xerox machine, printers, ink/toner, paper, parts, repair, servicing; per-machine lifetime cost (example Epson L805: ink ₹800 + printhead ₹1,200 + servicing ₹500 = ₹2,500); link costs to the right service for accurate profit.
20. Custom Module & Category Builder compulsory — any shopkeeper can add service/income/expense/category/custom page, with fields, payment mode, ledger link, profit inclusion.
21. Category-wise setup at signup: CSC ready-made (Dashboard, Cash, UPI, Money Transfer, PAN, Aadhaar, Voter ID, Ayushman, Xerox, Printing, Customers, Khata, Agents, Agent Ledger, Expenses, Receipts, Reports); other categories (Mobile, Grocery, Clothing, Electronics, Printing, Hardware, Medical, Restaurant/Cafe, Salon, Automobile/Garage, Wholesale, General Retail, Service, Other) get their own ready-made workflows via a Business Template Engine. Multiple categories in one profile was the checked radio — still pending per Section 28.
22. Both Android app + website, same backend/DB/login/profiles, admin panel.
23. Every category setup built by the system; owner only selects category, then adds own items.
24. Easy to use: simple navigation, 2–3 step entry, simple language, big buttons, smart search, visual reports, guided setup, helpful messages, undo/correction with audit, help section. "Powerful features backend mein, simplicity user ke saamne."
25. Edit/Delete/Restore everywhere: Recycle Bin, audit log, confirmation, permanent delete only with permission.
26. Customer Document Vault: separate page per customer, unlimited documents (PDF/JPG/PNG), per job, name/category/date/notes, preview/download/replace/delete/history, private encrypted storage.
27. Service-wise customers: Aadhaar page only Aadhaar customers, PAN only PAN, etc. Same person has separate records per service.
28. Language: English, Hindi, Gujarati (turn 29); then English/Hindi/Hinglish (turn 30), default English, proper professional English. Language screen after login, saved, changeable in Settings, synced app + website.
29. Free app: complete features free, no subscription/payment gateway in v1; hosting/DB/storage costs noted as real — zero-cost infrastructure not promised permanently (user rule: free only, use free tiers).
30. Website: React/Next.js + TypeScript, proper components, responsive, same login/profiles/data, sync. No HTML-only website.
31. UI design: Option 1 = Complete UI Screens (one page at a time as images); Option 2 = Clickable Prototype (interactive demo, click buttons to explore). User chose "2 Sahi Lag Rha Hai" = Option 2. Generated image: "Simple Explanation" infographic, centre phone "Al Falah Communication", Today Summary Income ₹5,420, Profit ₹1,220, ₹4,200, bar chart, Quick Actions, Customers Arsh Patel ₹1,250, Rohit Shah ₹0, Sana Khan ₹450. Prototype preview: Home, Today's Income ₹5,420, Expenses ₹1,220, Customer Due ₹3,500, Agent Payable ₹1,200, Xerox ₹350, Printing ₹450, Smart Card ₹200, Money Transfer Commission ₹300. NOTE: all these numbers are DEMO numbers from the ChatGPT preview — never use as real data.
32. Compilation docs (turns 37, 39, 40, 42): Master Development Prompt (Android first, then website), Complete Features document, Complete Master Discussion Document, Complete Project Conversation & Requirements Sections 1–28 + Final Objective. Note: the Final Objective in the compilation wrongly says "inventory, sales, purchase, customers, suppliers and finance" — that is NOT in the original chat; ignore it.
33. Turn 38 "Photo Me Bhai Muse Ko Bej Saku" — ChatGPT reply could not be read (never rendered).
34. Last message: "Muje Sector 28 Alag Se Copy Karke Do" — Section 28 (same 10 pending items as Record A).
