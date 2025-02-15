"use strict";

module.exports = {
  async find(ctx) {
    const knex = strapi.db.connection; // Directly connect to the DB
    const data = await knex("holiday").select("*"); // Fetch all data from holiday table
    return data;
  },
};
