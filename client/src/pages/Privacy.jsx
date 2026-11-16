import { useTranslation } from 'react-i18next'

export default function Privacy() {
  const { t } = useTranslation()
  return (
    <div style={{ maxWidth: 740, margin: '0 auto', padding: '2rem 1rem' }}>
      <h1>{t('privacy.title', { defaultValue: 'سياسة الخصوصية' })}</h1>
      <p style={{ color: 'var(--muted)', marginBottom: '2rem' }}>
        {t('privacy.updated', { defaultValue: 'آخر تحديث: 2024' })}
      </p>

      <section style={{ marginBottom: '2rem' }}>
        <h2>{t('privacy.collect', { defaultValue: 'ما البيانات التي نجمعها؟' })}</h2>
        <p>{t('privacy.collectText', { defaultValue: 'نجمع معلومات الحساب (الاسم، البريد الإلكتروني، رقم الهاتف)، بيانات الجلسات والتقدم الدراسي، والمعلومات التقنية الأساسية مثل عنوان IP.' })}</p>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2>{t('privacy.use', { defaultValue: 'كيف نستخدمها؟' })}</h2>
        <p>{t('privacy.useText', { defaultValue: 'نستخدم بياناتك لتشغيل المنصة وتحسين تجربة التعلم وإرسال الإشعارات المتعلقة بحسابك فقط.' })}</p>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2>{t('privacy.share', { defaultValue: 'هل نشارك بياناتك؟' })}</h2>
        <p>{t('privacy.shareText', { defaultValue: 'لا نبيع أو نشارك بياناتك الشخصية مع أطراف ثالثة. قد نشاركها مع مزودي الخدمة الضروريين لتشغيل المنصة بموجب اتفاقيات صارمة.' })}</p>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2>{t('privacy.rights', { defaultValue: 'حقوقك' })}</h2>
        <p>{t('privacy.rightsText', { defaultValue: 'يحق لك طلب الاطلاع على بياناتك أو تعديلها أو حذفها في أي وقت عبر التواصل معنا.' })}</p>
      </section>
    </div>
  )
}
