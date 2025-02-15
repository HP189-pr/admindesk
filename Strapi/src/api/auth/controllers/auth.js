const jwt = require('jsonwebtoken');

module.exports = {
  async login(ctx) {
    const { usercode, usrpassword } = ctx.request.body;

    if (!usercode || !usrpassword) {
      return ctx.badRequest('Usercode and password are required.');
    }

    // Find the user in Strapi
    const user = await strapi.db.query('plugin::users-permissions.user').findOne({
      where: { usercode },
    });

    if (!user) {
      return ctx.unauthorized('Invalid credentials.');
    }

    // Verify password
    const validPassword = await strapi.plugins['users-permissions'].services.user.validatePassword(
      usrpassword,
      user.password
    );

    if (!validPassword) {
      return ctx.unauthorized('Invalid credentials.');
    }

    // Generate JWT Token
    const token = jwt.sign({ id: user.id, usercode: user.usercode }, strapi.config.get('plugin.users-permissions.jwtSecret'), {
      expiresIn: '7d',
    });

    return ctx.send({ token, user });
  },
};
