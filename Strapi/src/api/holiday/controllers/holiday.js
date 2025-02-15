const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::holiday.holiday', ({ strapi }) => ({
  async find(ctx) {
    // Fetch holidays using `hdid`
    const holidays = await strapi.db.connection('holidays').select('*');

    return { data: holidays };
  },

  async findOne(ctx) {
    const { hdid } = ctx.params;

    if (!hdid) {
      return ctx.badRequest("hdid is required");
    }

    // Find a single holiday by `hdid`
    const holiday = await strapi.db.connection('holidays').where({ hdid }).first();

    if (!holiday) {
      return ctx.notFound("Holiday not found");
    }

    return { data: holiday };
  }
}));
