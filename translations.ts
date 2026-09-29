// UI-chrome translations only. Question text, answers, and voice
// notes are NEVER translated here or anywhere in the app — they
// stay exactly as the student/teacher wrote or spoke them. This
// dictionary covers only buttons, labels, and instructions, which
// is why it can stay small even as we add more languages later:
// each new language is ~40 short strings, not a translation engine.

export type LanguageCode = 'en' | 'hi' | 'bn';

export const SUPPORTED_LANGUAGES: { code: LanguageCode; label: string; nativeLabel: string }[] = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'hi', label: 'Hindi', nativeLabel: 'हिन्दी' },
  { code: 'bn', label: 'Bengali', nativeLabel: 'বাংলা' },
];

type TranslationKeys =
  | 'appTagline'
  | 'signInSubtitle'
  | 'emailPlaceholder'
  | 'sendCode'
  | 'sending'
  | 'otpPlaceholder'
  | 'verifyAndContinue'
  | 'verifying'
  | 'askHeading'
  | 'questionPlaceholder'
  | 'addPhoto'
  | 'photosAdded'
  | 'removePhoto'
  | 'subjectLabel'
  | 'ask'
  | 'outOfFreeQuestions'
  | 'outOfFreeQuestionsBody'
  | 'somethingWentWrong'
  | 'chooseLanguage'
  | 'chooseLanguageSubtitle'
  | 'continue'
  | 'teacherFeedHeading'
  | 'noOpenQueries'
  | 'accept'
  | 'alreadyAssigned'
  | 'accepted'
  | 'attachmentsCount'
  | 'becomeTeacherHeading'
  | 'institutionPlaceholder'
  | 'yearsExperiencePlaceholder'
  | 'bioPlaceholder'
  | 'selectSubjects'
  | 'selectLanguages'
  | 'saveAndContinue'
  | 'availableNow'
  | 'availableLater'
  | 'offline'
  | 'yourAvailability'
  | 'typeYourAnswer'
  | 'sendAnswer'
  | 'markResolved'
  | 'wasThisHelpful'
  | 'yesUnderstood'
  | 'stillHaveQuestion'
  | 'findingTeacher'
  | 'teacherAssigned'
  | 'statusPosted'
  | 'statusAssigned'
  | 'statusResolved';

type Dictionary = Record<TranslationKeys, string>;

const en: Dictionary = {
  appTagline: 'What are you stuck on?',
  signInSubtitle: 'Sign in to ask or answer a question',
  emailPlaceholder: 'you@example.com',
  sendCode: 'Send code',
  sending: 'Sending...',
  otpPlaceholder: '6-digit code',
  verifyAndContinue: 'Verify & continue',
  verifying: 'Verifying...',
  askHeading: 'What are you stuck on?',
  questionPlaceholder: 'Type your question...',
  addPhoto: 'Photo',
  photosAdded: 'photo(s) added',
  removePhoto: 'Remove photo',
  subjectLabel: 'Subject',
  ask: 'Ask',
  outOfFreeQuestions: "You're out of free questions this month",
  outOfFreeQuestionsBody: 'Add credits to keep asking, or wait for your monthly free questions to reset.',
  somethingWentWrong: 'Something went wrong',
  chooseLanguage: 'Choose your language',
  chooseLanguageSubtitle: "We'll show buttons and labels in this language. You can still ask and answer in whatever language you speak.",
  continue: 'Continue',
  teacherFeedHeading: 'Open questions',
  noOpenQueries: 'No open questions right now',
  accept: 'Accept',
  alreadyAssigned: 'Already taken by another teacher',
  accepted: 'Accepted',
  attachmentsCount: 'attachment(s)',
  becomeTeacherHeading: 'Become a teacher',
  institutionPlaceholder: 'School / institution (optional)',
  yearsExperiencePlaceholder: 'Years of experience',
  bioPlaceholder: 'Short bio (optional)',
  selectSubjects: 'Subjects you can help with',
  selectLanguages: 'Languages you can answer in',
  saveAndContinue: 'Save & continue',
  availableNow: 'Available now',
  availableLater: 'Available later',
  offline: 'Offline',
  yourAvailability: 'Your availability',
  typeYourAnswer: 'Explain the concept...',
  sendAnswer: 'Send answer',
  markResolved: 'Mark resolved',
  wasThisHelpful: 'Did this solve your doubt?',
  yesUnderstood: 'Yes, understood',
  stillHaveQuestion: 'I still have a question',
  findingTeacher: 'Finding a teacher...',
  teacherAssigned: 'Teacher assigned',
  statusPosted: 'Finding a teacher',
  statusAssigned: 'Teacher is helping you',
  statusResolved: 'Resolved',
};

const hi: Dictionary = {
  appTagline: 'आपको कहाँ दिक्कत हो रही है?',
  signInSubtitle: 'सवाल पूछने या जवाब देने के लिए साइन इन करें',
  emailPlaceholder: 'you@example.com',
  sendCode: 'कोड भेजें',
  sending: 'भेजा जा रहा है...',
  otpPlaceholder: '6 अंकों का कोड',
  verifyAndContinue: 'सत्यापित करें और जारी रखें',
  verifying: 'सत्यापित हो रहा है...',
  askHeading: 'आपको कहाँ दिक्कत हो रही है?',
  questionPlaceholder: 'अपना सवाल लिखें...',
  addPhoto: 'फ़ोटो',
  photosAdded: 'फ़ोटो जोड़ी गईं',
  removePhoto: 'फ़ोटो हटाएं',
  subjectLabel: 'विषय',
  ask: 'पूछें',
  outOfFreeQuestions: 'इस महीने आपके मुफ़्त सवाल खत्म हो गए',
  outOfFreeQuestionsBody: 'पूछते रहने के लिए क्रेडिट जोड़ें, या अगले महीने का इंतज़ार करें।',
  somethingWentWrong: 'कुछ गड़बड़ हो गई',
  chooseLanguage: 'अपनी भाषा चुनें',
  chooseLanguageSubtitle: 'बटन और लेबल इसी भाषा में दिखेंगे। आप अपने सवाल और जवाब किसी भी भाषा में दे सकते हैं।',
  continue: 'जारी रखें',
  teacherFeedHeading: 'खुले सवाल',
  noOpenQueries: 'अभी कोई खुला सवाल नहीं है',
  accept: 'स्वीकार करें',
  alreadyAssigned: 'किसी और शिक्षक ने पहले ही ले लिया',
  accepted: 'स्वीकार किया गया',
  attachmentsCount: 'अटैचमेंट',
  becomeTeacherHeading: 'शिक्षक बनें',
  institutionPlaceholder: 'स्कूल / संस्थान (वैकल्पिक)',
  yearsExperiencePlaceholder: 'अनुभव (वर्षों में)',
  bioPlaceholder: 'संक्षिप्त परिचय (वैकल्पिक)',
  selectSubjects: 'आप किन विषयों में मदद कर सकते हैं',
  selectLanguages: 'आप किन भाषाओं में जवाब दे सकते हैं',
  saveAndContinue: 'सहेजें और जारी रखें',
  availableNow: 'अभी उपलब्ध',
  availableLater: 'बाद में उपलब्ध',
  offline: 'ऑफ़लाइन',
  yourAvailability: 'आपकी उपलब्धता',
  typeYourAnswer: 'समझाएं...',
  sendAnswer: 'जवाब भेजें',
  markResolved: 'हल किया गया चिह्नित करें',
  wasThisHelpful: 'क्या इससे आपकी दिक्कत हल हुई?',
  yesUnderstood: 'हाँ, समझ आ गया',
  stillHaveQuestion: 'अभी भी सवाल है',
  findingTeacher: 'शिक्षक खोजा जा रहा है...',
  teacherAssigned: 'शिक्षक नियुक्त किया गया',
  statusPosted: 'शिक्षक खोजा जा रहा है',
  statusAssigned: 'शिक्षक आपकी मदद कर रहे हैं',
  statusResolved: 'हल हो गया',
};

const bn: Dictionary = {
  appTagline: 'তোমার কোথায় সমস্যা হচ্ছে?',
  signInSubtitle: 'প্রশ্ন জিজ্ঞাসা করতে বা উত্তর দিতে সাইন ইন করুন',
  emailPlaceholder: 'you@example.com',
  sendCode: 'কোড পাঠান',
  sending: 'পাঠানো হচ্ছে...',
  otpPlaceholder: '৬ সংখ্যার কোড',
  verifyAndContinue: 'যাচাই করে এগিয়ে যান',
  verifying: 'যাচাই হচ্ছে...',
  askHeading: 'তোমার কোথায় সমস্যা হচ্ছে?',
  questionPlaceholder: 'তোমার প্রশ্ন লেখো...',
  addPhoto: 'ছবি',
  photosAdded: 'টি ছবি যোগ করা হয়েছে',
  removePhoto: 'ছবি সরান',
  subjectLabel: 'বিষয়',
  ask: 'জিজ্ঞাসা করুন',
  outOfFreeQuestions: 'এই মাসে তোমার ফ্রি প্রশ্ন শেষ হয়ে গেছে',
  outOfFreeQuestionsBody: 'জিজ্ঞাসা চালিয়ে যেতে ক্রেডিট যোগ করো, অথবা পরের মাসের জন্য অপেক্ষা করো।',
  somethingWentWrong: 'কিছু একটা ভুল হয়েছে',
  chooseLanguage: 'তোমার ভাষা বেছে নাও',
  chooseLanguageSubtitle: 'বোতাম ও লেবেল এই ভাষায় দেখানো হবে। তুমি যেকোনো ভাষায় প্রশ্ন জিজ্ঞাসা করতে ও উত্তর দিতে পারো।',
  continue: 'এগিয়ে যান',
  teacherFeedHeading: 'খোলা প্রশ্ন',
  noOpenQueries: 'এখন কোনো খোলা প্রশ্ন নেই',
  accept: 'গ্রহণ করুন',
  alreadyAssigned: 'অন্য একজন শিক্ষক ইতিমধ্যে নিয়েছেন',
  accepted: 'গৃহীত হয়েছে',
  attachmentsCount: 'টি সংযুক্তি',
  becomeTeacherHeading: 'শিক্ষক হন',
  institutionPlaceholder: 'স্কুল / প্রতিষ্ঠান (ঐচ্ছিক)',
  yearsExperiencePlaceholder: 'অভিজ্ঞতা (বছরে)',
  bioPlaceholder: 'সংক্ষিপ্ত পরিচিতি (ঐচ্ছিক)',
  selectSubjects: 'তুমি কোন বিষয়ে সাহায্য করতে পারো',
  selectLanguages: 'তুমি কোন ভাষায় উত্তর দিতে পারো',
  saveAndContinue: 'সংরক্ষণ করে এগিয়ে যান',
  availableNow: 'এখন উপলব্ধ',
  availableLater: 'পরে উপলব্ধ',
  offline: 'অফলাইন',
  yourAvailability: 'তোমার উপলব্ধতা',
  typeYourAnswer: 'ব্যাখ্যা করো...',
  sendAnswer: 'উত্তর পাঠান',
  markResolved: 'সমাধান হয়েছে চিহ্নিত করুন',
  wasThisHelpful: 'এটা কি তোমার সমস্যার সমাধান করেছে?',
  yesUnderstood: 'হ্যাঁ, বুঝেছি',
  stillHaveQuestion: 'এখনও প্রশ্ন আছে',
  findingTeacher: 'শিক্ষক খোঁজা হচ্ছে...',
  teacherAssigned: 'শিক্ষক নিযুক্ত হয়েছেন',
  statusPosted: 'শিক্ষক খোঁজা হচ্ছে',
  statusAssigned: 'শিক্ষক তোমাকে সাহায্য করছেন',
  statusResolved: 'সমাধান হয়েছে',
};

export const translations: Record<LanguageCode, Dictionary> = { en, hi, bn };
