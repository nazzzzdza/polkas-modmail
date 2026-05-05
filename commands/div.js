module.exports = {
  name: "div",

  async execute(message) {
    await message.channel.send({
      files: ["https://cdn.discordapp.com/attachments/1461112512534675713/1501240193611464734/image.png"]
    });
  }
};
