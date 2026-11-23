'use strict';

const router = require('express').Router();
const path = require('path');

// بيانات علامات التشوير
const signsData = require('../road-signs.json');

// GET /api/signs — كل العلامات مع الفئات
router.get('/', (req, res) => {
  const { category, q } = req.query;
  let signs = signsData.signs;

  // فلترة حسب الفئة
  if (category) {
    signs = signs.filter(s => s.category === category);
  }

  // بحث بالاسم أو الرمز
  if (q) {
    const query = q.toLowerCase();
    signs = signs.filter(s =>
      s.name_ar.includes(q) ||
      s.name_fr.toLowerCase().includes(query) ||
      s.code.toLowerCase().includes(query) ||
      s.description_ar.includes(q)
    );
  }

  res.json({
    categories: signsData.categories,
    signs,
    total: signs.length
  });
});

// GET /api/signs/categories — الفئات فقط
router.get('/categories', (req, res) => {
  res.json(signsData.categories);
});

// GET /api/signs/:code — علامة واحدة بالرمز
router.get('/:code', (req, res) => {
  const sign = signsData.signs.find(
    s => s.code.toLowerCase() === req.params.code.toLowerCase()
  );
  if (!sign) return res.status(404).json({ error: 'علامة غير موجودة' });

  const category = signsData.categories.find(c => c.id === sign.category);
  res.json({ ...sign, category_info: category });
});

module.exports = router;
