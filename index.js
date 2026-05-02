const express = require("express");
const app = express();

app.get("/", (_, res) => res.send("Modmail running"));

app.listen(3000, () => console.log("Web server running"));

const {
  Client,
  GatewayIntentBits,
  Partials,
  ChannelType,
  EmbedBuilder
} = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel]
});

// ===== CONFIG =====
const GUILD_ID = "1461112510798233927";
const FORUM_CHANNEL_ID = "1500206600529641482";
const STAFF_ROLE_ID = "1461112511301685296";

// memory map (resets on restart)
const tickets = new Map(); // userId -> threadId

client.once("ready", () => {
  console.log(`READY: ${client.user.tag}`);
});

// ================= MAIN HANDLER =================
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  // ================= USER DM =================
  if (message.channel.type === ChannelType.DM) {
    let threadId = tickets.get(message.author.id);
    let thread;

    const guild = await client.guilds.fetch(GUILD_ID);
    const forum = await guild.channels.fetch(FORUM_CHANNEL_ID);

    // create ticket if none exists
    if (!threadId) {
      thread = await forum.threads.create({
        name: `ticket-${message.author.username}`,
        message: {
          content: `📩 New ticket from **${message.author.tag}**`
        }
      });

      tickets.set(message.author.id, thread.id);

      await thread.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("New Ticket")
            .setDescription(message.content || "*no text*")
            .setColor("Blue")
        ]
      });

      await message.react("📩");
      return;
    }

    thread = await client.channels.fetch(threadId);
    if (!thread) return;

    await thread.send({
      content: `**${message.author.tag}:** ${message.content || "*no text*"}`,
      files: [...message.attachments.values()]
    });

    return;
  }

  // ================= STAFF HANDLER =================
  if (!message.guild) return;

  const isThread =
    message.channel.type === ChannelType.PublicThread ||
    message.channel.type === ChannelType.PrivateThread;

  if (!isThread) return;

  if (!message.member?.roles.cache.has(STAFF_ROLE_ID)) return;

  const entry = [...tickets.entries()]
    .find(([_, threadId]) => threadId === message.channel.id);

  if (!entry) return;

  const userId = entry[0];

  const content = message.content?.trim();

  // ================= COMMAND HANDLER =================
  if (content.startsWith("!")) {

    // ===== CLOSE =====
    if (content === "!close") {
      const closeEmbed = new EmbedBuilder()
        .setTitle("🔒 Ticket Closed")
        .setDescription(
          "This ticket has been closed by staff.\n\n" +
          "Send another message to open a new ticket."
        )
        .setColor("Red");

      await message.channel.send({ embeds: [closeEmbed] });

      try {
        const user = await client.users.fetch(userId);

        await user.send({
          embeds: [
            new EmbedBuilder()
              .setTitle("🔒 Ticket Closed")
              .setDescription(
                "Your ticket has been closed.\nSend a new message anytime to open a new one."
              )
              .setColor("Red")
          ]
        });
      } catch (err) {
        console.log("DM failed:", err);
      }

      await message.channel.setArchived(true);
      tickets.delete(userId);

      return;
    }

    // block all other commands
    return;
  }

  // ================= NORMAL STAFF MESSAGE =================
  try {
    const user = await client.users.fetch(userId);

    await user.send(`💬 **Staff:** ${message.content}`);
  } catch (err) {
    console.log("DM failed:", err);
  }
});

  client.user.setPresence({
    activities: [{
      name: "dm me for support <3",
      type: 1,
      url: "https://www.twitch.tv/discord"
    }],
    status: "online"
  });

client.login(process.env.TOKEN);
