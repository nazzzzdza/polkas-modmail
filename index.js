const { 
  Client, 
  GatewayIntentBits, 
  Partials, 
  ChannelType, 
  EmbedBuilder 
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

// ===== CONFIG =====
const GUILD_ID = "YOUR_SERVER_ID";
const FORUM_CHANNEL_ID = "YOUR_FORUM_CHANNEL_ID";
const STAFF_ROLE_ID = "YOUR_STAFF_ROLE_ID";

const openTickets = new Map();

// ===== BOT READY =====
client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// ===== USER DM → CREATE THREAD =====
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  // USER DM
  if (message.channel.type === ChannelType.DM) {
    let thread = openTickets.get(message.author.id);

    if (!thread) {
      const guild = await client.guilds.fetch(GUILD_ID);
      const forum = await guild.channels.fetch(FORUM_CHANNEL_ID);

      thread = await forum.threads.create({
        name: `ticket-${message.author.username}`,
        message: {
          content: `<@&${STAFF_ROLE_ID}> New ticket from ${message.author.tag}`,
          embeds: [
            new EmbedBuilder()
              .setTitle("New Ticket Opened")
              .setDescription("Staff will respond shortly.")
              .setColor("Blue")
          ]
        }
      });

      openTickets.set(message.author.id, thread);

      await message.react("📩");
    }

    // SEND USER MESSAGE TO THREAD
    await thread.send({
      content: `**${message.author.tag}:** ${message.content}`,
      files: [...message.attachments.values()]
    });
  }

  // STAFF REPLY
  if (message.guild && message.channel.isThread()) {
    if (!message.member.roles.cache.has(STAFF_ROLE_ID)) return;

    if (message.content.startsWith("!r ")) {
      const userId = [...openTickets.entries()]
        .find(([_, t]) => t.id === message.channel.id)?.[0];

      if (!userId) return;

      const user = await client.users.fetch(userId);

      const reply = message.content.slice(3);

      await user.send(reply);
    }

    // CLOSE COMMAND
    if (message.content === "!close") {
      const userId = [...openTickets.entries()]
        .find(([_, t]) => t.id === message.channel.id)?.[0];

      if (!userId) return;

      const user = await client.users.fetch(userId);

      await user.send("Your ticket has been closed.");

      openTickets.delete(userId);

      await message.channel.setLocked(true);
      await message.channel.setArchived(true);
    }
  }
});

client.login(process.env.TOKEN);
