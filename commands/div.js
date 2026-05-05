module.exports = {
  name: "div",

  async execute(message) {
    // delete the command message
    await message.delete().catch(() => {});

    // send image (auto-embeds)
    await message.channel.send(
      "https://cdn.discordapp.com/attachments/1461112512534675713/1501240193611464734/image.png"
    );
  }
};
