/**
 * i18n — simple translation layer matching the existing app.
 * Uses i18next under the hood.
 */
import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'

// ── Arabic translations (ar) ────────────────────────────────────────────────
const ar = {
  'a11y.skip': 'انتقل إلى المحتوى', 'a11y.language': 'تغيير اللغة', 'a11y.menu': 'القائمة',
  'brand.name': 'CODE', 'brand.tagline': 'الدراسة النظرية — رخصة السياقة صنف B',
  'footer.text': 'منصة تعلم الدراسة النظرية لرخصة السياقة', 'footer.privacy': 'الخصوصية', 'footer.disclaimer': 'منصة تدريبية غير رسمية',
  'nav.home': 'الرئيسية', 'nav.dashboard': 'لوحتي', 'nav.lessons': 'الدروس', 'nav.practice': 'السلاسل', 'nav.exam': 'امتحان تجريبي', 'nav.mistakes': 'أخطائي',
  'nav.login': 'دخول', 'nav.register': 'إنشاء حساب', 'nav.logout': 'خروج', 'nav.profile': 'حسابي', 'nav.admin': 'الإدارة', 'nav.bookings': 'حجز الحصص', 'nav.ai': 'Monitor AI', 'nav.exams': 'متابعة الامتحانات',
  'common.actions': 'إجراءات', 'common.cancel': 'إلغاء', 'common.confirm': 'تأكيد', 'common.loading': 'جارٍ التحميل…', 'common.ok': 'حسنا', 'common.save': 'حفظ', 'common.saved': 'تم الحفظ',
  'common.delete': 'حذف', 'common.edit': 'تعديل', 'common.new': 'جديد', 'common.search': 'بحث', 'common.all': 'الكل', 'common.back': 'رجوع', 'common.none': 'لا شيء', 'common.yes': 'نعم', 'common.no': 'لا',
  'common.optional': 'اختياري', 'common.understood': 'حسناً، تم', 'common.select': 'اختر', 'common.email': 'البريد الإلكتروني', 'common.archive': 'أرشفة', 'common.unarchive': 'استعادة', 'common.archived': 'مؤرشف',
  'role.student': 'متعلم', 'role.instructor': 'مدرّب', 'role.admin': 'أدمين', 'role.school': 'مؤسسة',
  'err.server_error': 'حدث خطأ في الخادم، حاول مجددا.', 'err.network_error': 'تعذر الاتصال بالخادم.', 'err.timeout': 'استغرق الطلب وقتاً طويلاً.', 'err.page_not_found': 'الصفحة غير موجودة.', 'err.no_questions': 'لا توجد أسئلة متاحة.',
  'err.invalid_otp': 'الرمز غير صحيح أو انتهت صلاحيته.', 'err.otp_send_failed': 'فشل إرسال رمز التحقق.', 'err.invalid_reset_token': 'الرابط غير صالح أو انتهت صلاحيته.',
  'err.invalid_credentials': 'البريد الإلكتروني أو كلمة المرور غير صحيحة.', 'err.email_taken': 'هذا البريد الإلكتروني مستعمل بالفعل.', 'err.weak_password': 'كلمة المرور ضعيفة (8 أحرف على الأقل).', 'err.invalid_email': 'بريد إلكتروني غير صالح.',
  'err.unauthorized': 'يجب تسجيل الدخول.', 'err.forbidden': 'غير مسموح.', 'err.not_found': 'غير موجود.', 'err.rate_limited': 'محاولات كثيرة، انتظر قليلا.',
  'err.session_replaced': 'تم تسجيل الدخول إلى حسابك من جهاز آخر، فتم إخراجك من هذا الجهاز.',
  'err.school_not_found': 'لم يتم العثور على مؤسسة بهذا الرقم.',
  'auth.loginTitle': 'تسجيل الدخول', 'auth.loginSubtitle': 'تابع تعلمك من حيث توقفت', 'auth.registerTitle': 'إنشاء حساب', 'auth.registerSubtitle': 'سجل مجانا وابدأ التدرب',
  'auth.email': 'البريد الإلكتروني', 'auth.password': 'كلمة المرور', 'auth.name': 'الاسم الكامل',
  'auth.login': 'دخول', 'auth.createAccount': 'إنشاء الحساب', 'auth.noAccount': 'ليس لديك حساب؟', 'auth.haveAccount': 'لديك حساب؟',
  'auth.acceptTerms': 'أوافق على سياسة الخصوصية', 'auth.loggedOut': 'تم تسجيل الخروج', 'auth.welcome': 'مرحبا {{name}}',
  'auth.forgotPassword': 'نسيت كلمة السر؟', 'auth.forgotTitle': 'استعادة كلمة السر', 'auth.forgotSend': 'إرسال الرابط',
  'auth.forgotSent': 'تم الإرسال! تحقق من بريدك الإلكتروني.',
  'auth.backToLogin': '← العودة لتسجيل الدخول', 'auth.resetTitle': 'كلمة سر جديدة',
  'auth.newPassword': 'كلمة السر الجديدة', 'auth.confirmPassword': 'تأكيد كلمة السر',
  'auth.passwordMismatch': 'كلمتا السر غير متطابقتين', 'auth.resetConfirm': 'حفظ كلمة السر الجديدة',
  'auth.resetSuccess': '✅ تم تغيير كلمة السر — سجّل الدخول الآن',
  'auth.otpTitle': 'التحقق بخطوتين', 'auth.otpSubtitle': 'تم إرسال رمز التحقق إلى {{email}}',
  'auth.otpCode': 'رمز التحقق (6 أرقام)', 'auth.otpVerify': 'تحقق والدخول', 'auth.otpResend': 'إعادة الإرسال',
  'auth.schoolNarsaNum': 'رقم رخصة المؤسسة (NARSA)', 'auth.schoolHint': 'إذا كنت منتسباً لمؤسسة تعليم سياقة، أدخل رقم رخصتها.',
  'home.title': 'اجتز الدراسة النظرية بثقة', 'home.subtitle': 'دروس مبسطة وتمارين وامتحانات تجريبية من {{n}} سؤالا. النجاح من {{pass}} صحيحة.',
  'home.cta': 'ابدأ مجانا', 'home.ctaLessons': 'تصفح الدروس',
  'home.s1.t': 'تعلّم', 'home.s1.d': 'اقرأ الدروس القصيرة المنظمة حسب المحاور.', 'home.s2.t': 'تدرّب', 'home.s2.d': 'حل التمارين والسلاسل مع تصحيح فوري.',
  'home.s3.t': 'امتحن نفسك', 'home.s3.d': 'امتحانات تجريبية بنفس شروط الامتحان الرسمي.', 'home.s4.t': 'راجع', 'home.s4.d': 'مراجعة ذكية لأخطائك في الوقت المناسب.',
  'dash.hello': 'مرحبا {{name}}', 'dash.subtitle': 'هذا ملخص تقدمك', 'dash.readiness': 'الجاهزية للامتحان', 'dash.ready': 'أنت جاهز', 'dash.notReady': 'تحتاج مزيدا من التدرب',
  'dash.mastery': 'الإتقان', 'dash.questionsSeen': 'أسئلة تمت مشاهدتها', 'dash.lessonsDone': 'دروس منجزة', 'dash.streak': 'أيام متتالية',
  'dash.byCategory': 'التقدم حسب المحور', 'dash.recent': 'آخر النشاطات', 'dash.noActivity': 'لا نشاط بعد. ابدأ بتمرين!',
  'dash.qaExam': 'امتحان تجريبي رسمي', 'dash.qaExamSub': '{{n}} سؤال بنظام نارسا', 'dash.qaPractice': 'السلاسل والمحاور', 'dash.qaPracticeSub': '{{n}} سلسلة متاحة',
  'dash.qaMistakes': 'أخطائي الذكية', 'dash.qaMistakesSub': '{{n}} سؤال للمراجعة', 'dash.qaAi': 'Monitor AI', 'dash.qaAiSub': 'اسأل على أي قاعدة',
  'exam.mockTitle': 'الامتحان التجريبي', 'exam.title': 'الامتحان التجريبي', 'exam.subtitle': 'نفس شروط الامتحان الرسمي', 'exam.start': 'ابدأ الامتحان', 'exam.duration': 'المدة الإجمالية',
  'quiz.counter': 'السؤال {{i}} من {{n}}', 'quiz.next': 'التالي', 'quiz.prev': 'السابق', 'quiz.validate': 'تأكيد', 'quiz.finish': 'إنهاء', 'quiz.close': 'خروج',
  'quiz.bookmark': 'إضافة للمفضلة', 'quiz.listen': 'استماع', 'quiz.multiHint': 'أكثر من جواب صحيح', 'quiz.right': 'إجابة صحيحة ✓', 'quiz.wrong': 'إجابة خاطئة. الصحيح: {{a}}', 'quiz.timeUp': 'انتهى الوقت',
  'results.score': 'النتيجة', 'results.passed': 'ناجح 🎉', 'results.failed': 'لم تنجح', 'results.done': 'انتهى التمرين',
  'results.byCategory': 'النتيجة حسب المحور', 'results.correction': 'التصحيح', 'results.all': 'الكل', 'results.onlyWrong': 'الأخطاء فقط',
  'results.newExam': 'امتحان جديد', 'results.retry': 'إعادة المحاولة', 'results.dashboard': 'لوحتي',
  'lessons.title': 'الدروس', 'lessons.subtitle': 'محتوى منظم حسب المحاور', 'lessons.module': 'المحور', 'lessons.done': 'منجز',
  'practice.title': 'التمارين', 'practice.subtitle': 'اختر طريقة التدرب', 'practice.series': 'السلاسل', 'practice.seriesN': 'سلسلة {{n}}',
  'mistakes.title': 'أخطائي', 'mistakes.empty': 'لا توجد أخطاء بعد. أحسنت!',
  'profile.title': 'حسابي', 'profile.language': 'اللغة', 'profile.changePassword': 'تغيير كلمة المرور', 'profile.delete': 'حذف الحساب',
  'admin.title': 'الإدارة', 'admin.questions': 'الأسئلة', 'admin.series': 'السلاسل', 'admin.lessons': 'الدروس', 'admin.students': 'المتعلمون', 'admin.users': 'المستخدمون', 'admin.settings': 'الإعدادات',
  'live.liveSession': 'الحصة الجماعية', 'live.waiting': 'حصة قادمة...', 'live.ended': 'انتهت الحصة', 'live.waitingRoom': 'في انتظار بدء الحصة',
  'champ.title': 'بطل الكود', 'champ.start': 'ابدأ التحدي', 'champ.joinToday': 'أجب على 7 أسئلة بأسرع وقت وكن بطل اليوم!',
  'notif.label': 'الإشعارات', 'notif.empty': 'لا توجد إشعارات جديدة',
  'ai.subtitle': 'أسأل أي سؤال حول قانون السير المغربي', 'ai.send': 'إرسال', 'ai.placeholder': 'اكتب سؤالك هنا…',
  'booking.title': 'حجز الحصص', 'booking.book': 'حجز', 'booking.cancel': 'إلغاء',
  'schools.title': 'مؤسسات تعليم السياقة', 'schools.addSchool': 'إضافة مؤسسة',
}

// ── French translations (fr) ─────────────────────────────────────────────────
const fr = {
  'a11y.skip': 'Aller au contenu', 'a11y.language': 'Changer de langue', 'a11y.menu': 'Menu',
  'brand.name': 'CODE', 'brand.tagline': 'Code de la route — permis B',
  'footer.text': "Plateforme d'apprentissage du code de la route", 'footer.privacy': 'Confidentialité', 'footer.disclaimer': "Plateforme d'entraînement non officielle",
  'nav.home': 'Accueil', 'nav.dashboard': 'Mon tableau de bord', 'nav.lessons': 'Leçons', 'nav.practice': 'Séries', 'nav.exam': 'Examen blanc', 'nav.mistakes': 'Mes erreurs',
  'nav.login': 'Connexion', 'nav.register': 'Créer un compte', 'nav.logout': 'Déconnexion', 'nav.profile': 'Mon profil', 'nav.admin': 'Administration', 'nav.bookings': 'Réservation', 'nav.ai': 'Monitor AI', 'nav.exams': 'Examens',
  'common.actions': 'Actions', 'common.cancel': 'Annuler', 'common.confirm': 'Confirmer', 'common.loading': 'Chargement…', 'common.ok': 'OK', 'common.save': 'Enregistrer', 'common.saved': 'Enregistré',
  'common.delete': 'Supprimer', 'common.edit': 'Modifier', 'common.new': 'Nouveau', 'common.search': 'Rechercher', 'common.all': 'Tout', 'common.back': 'Retour', 'common.none': 'Aucun', 'common.yes': 'Oui', 'common.no': 'Non',
  'common.optional': 'facultatif', 'common.understood': 'Compris', 'common.select': 'Choisir', 'common.email': 'Adresse e-mail', 'common.archive': 'Archiver', 'common.unarchive': 'Restaurer', 'common.archived': 'Archivé',
  'role.student': 'Élève', 'role.instructor': 'Moniteur', 'role.admin': 'Administrateur', 'role.school': 'Auto-école',
  'err.server_error': 'Erreur serveur, réessayez.', 'err.network_error': 'Impossible de joindre le serveur.', 'err.timeout': 'La requête a pris trop de temps.', 'err.page_not_found': 'Page introuvable.', 'err.no_questions': 'Aucune question disponible.',
  'err.invalid_otp': 'Code incorrect ou expiré.', 'err.otp_send_failed': "Échec de l'envoi du code.", 'err.invalid_reset_token': 'Lien invalide ou expiré.',
  'err.invalid_credentials': 'E-mail ou mot de passe incorrect.', 'err.email_taken': 'Cet e-mail est déjà utilisé.', 'err.weak_password': 'Mot de passe trop faible (8 caractères min).', 'err.invalid_email': 'E-mail invalide.',
  'err.unauthorized': 'Connexion requise.', 'err.forbidden': 'Accès refusé.', 'err.not_found': 'Introuvable.', 'err.rate_limited': 'Trop de tentatives, patientez.',
  'err.session_replaced': "Votre compte a été ouvert sur un autre appareil, vous avez été déconnecté ici.",
  'err.school_not_found': "Aucun auto-école trouvé avec ce numéro.",
  'auth.loginTitle': 'Connexion', 'auth.loginSubtitle': 'Reprenez là où vous vous êtes arrêté', 'auth.registerTitle': 'Créer un compte', 'auth.registerSubtitle': 'Inscription gratuite',
  'auth.email': 'E-mail', 'auth.password': 'Mot de passe', 'auth.name': 'Nom complet',
  'auth.login': 'Se connecter', 'auth.createAccount': 'Créer mon compte', 'auth.noAccount': 'Pas encore de compte ?', 'auth.haveAccount': 'Déjà un compte ?',
  'auth.acceptTerms': "J'accepte la politique de confidentialité", 'auth.loggedOut': 'Vous êtes déconnecté', 'auth.welcome': 'Bienvenue {{name}}',
  'auth.forgotPassword': 'Mot de passe oublié ?', 'auth.forgotTitle': 'Récupérer votre mot de passe', 'auth.forgotSend': 'Envoyer le lien',
  'auth.forgotSent': 'Envoyé ! Vérifiez votre boîte mail.',
  'auth.backToLogin': '← Retour à la connexion', 'auth.resetTitle': 'Nouveau mot de passe',
  'auth.newPassword': 'Nouveau mot de passe', 'auth.confirmPassword': 'Confirmer le mot de passe',
  'auth.passwordMismatch': 'Les mots de passe ne correspondent pas', 'auth.resetConfirm': 'Enregistrer le nouveau mot de passe',
  'auth.resetSuccess': '✅ Mot de passe modifié — connectez-vous maintenant',
  'auth.otpTitle': 'Vérification en deux étapes', 'auth.otpSubtitle': 'Un code a été envoyé à {{email}}',
  'auth.otpCode': 'Code de vérification (6 chiffres)', 'auth.otpVerify': 'Vérifier et se connecter', 'auth.otpResend': 'Renvoyer le code',
  'auth.schoolNarsaNum': "N° de licence NARSA de l'auto-école", 'auth.schoolHint': "Si vous êtes inscrit dans un auto-école, saisissez son numéro.",
  'home.title': 'Réussissez le code en confiance', 'home.subtitle': 'Leçons, exercices et examens blancs de {{n}} questions. Réussite à partir de {{pass}} bonnes réponses.',
  'home.cta': 'Commencer gratuitement', 'home.ctaLessons': 'Voir les leçons',
  'home.s1.t': 'Apprenez', 'home.s1.d': 'Des leçons courtes organisées par thème.', 'home.s2.t': "Entraînez-vous", 'home.s2.d': 'Exercices et séries avec correction immédiate.',
  'home.s3.t': 'Testez-vous', 'home.s3.d': 'Examens blancs aux conditions réelles.', 'home.s4.t': 'Révisez', 'home.s4.d': 'Révision intelligente de vos erreurs.',
  'dash.hello': 'Bonjour {{name}}', 'dash.subtitle': 'Voici un résumé de vos progrès', 'dash.readiness': "Préparation à l'examen", 'dash.ready': 'Vous êtes prêt', 'dash.notReady': 'Continuez à vous entraîner',
  'dash.mastery': 'Maîtrise', 'dash.questionsSeen': 'Questions vues', 'dash.lessonsDone': 'Leçons terminées', 'dash.streak': 'Jours consécutifs',
  'dash.byCategory': 'Progression par thème', 'dash.recent': 'Activité récente', 'dash.noActivity': 'Aucune activité. Lancez un exercice !',
  'dash.qaExam': 'Examen blanc officiel', 'dash.qaExamSub': '{{n}} questions, format NARSA', 'dash.qaPractice': 'Séries et thèmes', 'dash.qaPracticeSub': '{{n}} séries disponibles',
  'dash.qaMistakes': 'Mes erreurs', 'dash.qaMistakesSub': '{{n}} questions à revoir', 'dash.qaAi': 'Monitor AI', 'dash.qaAiSub': 'Posez une question sur une règle',
  'exam.mockTitle': 'Examen blanc', 'exam.title': "Examen blanc", 'exam.subtitle': "Mêmes conditions que l'examen officiel", 'exam.start': "Démarrer l'examen", 'exam.duration': 'Durée totale',
  'quiz.counter': 'Question {{i}} sur {{n}}', 'quiz.next': 'Suivant', 'quiz.prev': 'Précédent', 'quiz.validate': 'Valider', 'quiz.finish': 'Terminer', 'quiz.close': 'Quitter',
  'quiz.bookmark': 'Ajouter aux favoris', 'quiz.listen': 'Écouter', 'quiz.multiHint': 'Plusieurs réponses possibles', 'quiz.right': 'Bonne réponse ✓', 'quiz.wrong': 'Mauvaise réponse. Correct : {{a}}', 'quiz.timeUp': 'Temps écoulé',
  'results.score': 'Score', 'results.passed': 'Réussi 🎉', 'results.failed': 'Pas cette fois', 'results.done': 'Exercice terminé',
  'results.byCategory': 'Résultat par thème', 'results.correction': 'Correction', 'results.all': 'Tout', 'results.onlyWrong': 'Erreurs seulement',
  'results.newExam': 'Nouvel examen', 'results.retry': 'Réessayer', 'results.dashboard': 'Tableau de bord',
  'lessons.title': 'Leçons', 'lessons.subtitle': 'Contenu organisé par thème', 'lessons.module': 'Thème', 'lessons.done': 'Terminée',
  'practice.title': 'Entraînement', 'practice.subtitle': 'Choisissez votre mode', 'practice.series': 'Séries', 'practice.seriesN': 'Série {{n}}',
  'mistakes.title': 'Mes erreurs', 'mistakes.empty': "Aucune erreur pour l'instant. Bravo !",
  'profile.title': 'Mon profil', 'profile.language': 'Langue', 'profile.changePassword': 'Changer le mot de passe', 'profile.delete': 'Supprimer mon compte',
  'admin.title': 'Administration', 'admin.questions': 'Questions', 'admin.series': 'Séries', 'admin.lessons': 'Leçons', 'admin.students': 'Élèves', 'admin.users': 'Utilisateurs', 'admin.settings': 'Paramètres',
  'live.liveSession': 'Session en direct', 'live.waiting': 'Session à venir...', 'live.ended': 'Session terminée', 'live.waitingRoom': 'En attente du démarrage',
  'champ.title': 'Champion du Code', 'champ.start': 'Commencer le défi', 'champ.joinToday': 'Répondez à 7 questions le plus vite possible !',
  'notif.label': 'Notifications', 'notif.empty': 'Aucune nouvelle notification',
  'ai.subtitle': 'Posez une question sur le code de la route marocain', 'ai.send': 'Envoyer', 'ai.placeholder': 'Écrivez votre question ici…',
  'booking.title': 'Réservation des séances', 'booking.book': 'Réserver', 'booking.cancel': 'Annuler',
  'schools.title': "Établissements d'auto-école", 'schools.addSchool': 'Ajouter un établissement',
}

i18next
  .use(initReactI18next)
  .init({
    resources: {
      ar: { translation: ar },
      fr: { translation: fr },
    },
    lng: (() => {
      try { return localStorage.getItem('cp_locale') || 'ar' } catch { return 'ar' }
    })(),
    fallbackLng: 'ar',
    interpolation: { escapeValue: false },
  })

export default i18next

export function setLocale(lang) {
  i18next.changeLanguage(lang)
  try { localStorage.setItem('cp_locale', lang) } catch { /* ignore */ }
  document.documentElement.lang = lang
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
}

export const catName = (c, lang) => {
  if (!c) return ''
  const l = lang || i18next.language || 'ar'
  return c[`name_${l}`] || c.name || c.name_ar || c.name_fr || ''
}
