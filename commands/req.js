const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("req")
    .setDescription("request icons, layouts etc.")
    .addStringOption(option =>
      option.setName("text")
        .setDescription("request text")
        .setRequired(true)
    ),

  async execute(interaction) {

    const requestText = interaction.options.getString("text");

    const message = `
_ _
-# _ _            new request from ${interaction.user}
-# _ _            \`${requestText}\`
-# _ _            <@&1502628396906188960>       ◞
`;

    await interaction.reply({
      content: message
    });
  }
};
