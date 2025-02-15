module.exports = {
  lifecycles: {
    async beforeCreate(data) {
      if (!data.hdid) {
        throw new Error('hdid is required');
      }
    }
  }
};
