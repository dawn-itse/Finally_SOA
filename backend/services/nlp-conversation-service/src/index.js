const express = require('express');
const { pool } = require('../../../database/pool');
const { reply, fail, jsonBody, methodNotAllowed, listenService } = require('../../../lib/http');

const NLP_ROUTE = '/api/v1/nlp/parse';
const dishText = import('../../../../shared/dishText.mjs');

function createNlpRouter(db = pool) {
  const router = express.Router();

  router.post(NLP_ROUTE, jsonBody, async (req, res) => {
    const { text, source = 'input' } = req.body;
    if (typeof text !== 'string' || !['input', 'suggestion'].includes(source)) {
      return fail(res, 400, 'Cần chuỗi text và nguồn input hoặc suggestion.');
    }

    const { parseDish } = await dishText;
    const parsed = parseDish(text, source);
    if (!parsed) return fail(res, 422, 'Chỉ nhập tên món. Chọn giá và bán kính bằng bộ lọc.');

    const [aliases] = await db.execute(
      'SELECT canonical_dish FROM nlp_dish_alias WHERE alias_normalized = ?',
      [parsed.normalizedDish]
    );
    const alias = aliases[0];
    const data = alias ? parseDish(alias.canonical_dish) || parsed : parsed;
    return reply(res, 200, { success: true, data });
  });
  router.all(NLP_ROUTE, methodNotAllowed('POST'));

  return router;
}

if (require.main === module) {
  listenService(createNlpRouter(), Number(process.env.NLP_PORT) || 4002, 'NLP Conversation Service');
}

module.exports = { createNlpRouter };
