const express = require("express");
const app = express();

app.get("/", (_, res) => res.send("Modmail running"));

app.listen(3000, () => console.log("Web running"));

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

// CONFIG
const GUILD_ID = "1461112510798233927";
const FORUM_CHANNEL_ID = "1500206600529641482";
const STAFF_ROLE_ID = "1461112511301685296";

// MEMORY (only while bot is running)
const tickets = new Map(); // userId -> threadId

client.once("ready", () => {
  console.log(`READY: ${client.user.tag}`);
});

// ================= DM → THREAD =================
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  // USER DM
  if (message.channel.type === ChannelType.DM) {
    let threadId = tickets.get(message.author.id);
    let thread;

    const guild = await client.guilds.fetch(GUILD_ID);
    const forum = await guild.channels.fetch(FORUM_CHANNEL_ID);

    // CREATE THREAD IF NONE
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

    await thread.send(
      `**${message.author.tag}:** ${message.content || "*no text*"}`
    );
  }

  // ================= STAFF → USER =================
  if (!message.guild) return;

  const isThread =
    message.channel.type === ChannelType.PublicThread ||
    message.channel.type === ChannelType.PrivateThread;

  if (!isThread) return;

  if (!message.member?.roles.cache.has(STAFF_ROLE_ID)) return;

  // find user from memory
  const entry = [...tickets.entries()]
    .find(([userId, threadId]) => threadId === message.channel.id);

  if (!entry) return;

  const userId = entry[0];
  const user = await client.users.fetch(userId);

  // SEND DM
  try {
    await user.send(`Staff: ${message.content}`);
  } catch (err) {
    console.log("DM FAILED:", err);
  }

  // ================= CLOSE + TRANSCRIPT =================
if (message.content === "!close") {
  const closeEmbed = new EmbedBuilder()
    .setTitle("🔒 Ticket Closed")
    .setDescription(
      "This ticket has been closed by staff.\n\n" +
      "If you send another message, a new ticket will automatically be created."
    )
    .setColor("Red")
    .setTimestamp();

  // Send to thread (NO TEXT MESSAGE)
  await message.channel.send({
    embeds: [closeEmbed]
  });

  // Archive thread
  await message.channel.setArchived(true);

  // Remove from memory
  const entry = [...tickets.entries()]
    .find(([_, threadId]) => threadId === message.channel.id);

  if (entry) {
    const userId = entry[0];

    try {
      const user = await client.users.fetch(userId);

      await user.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("🔒 Ticket Closed")
            .setDescription(
              "Your ticket has been closed.\n\n" +
              "Send another message anytime to open a new one."
            )
            .setColor("Red")
        ]
      });
    } catch (err) {
      console.log("DM close failed:", err);
    }

    tickets.delete(userId);
  }

  return;
}

  // NORMAL REPLY (no command needed)
  try {
    await user.send(`Staff: ${message.content}`);
  } catch (err) {
    console.log("DM FAILED:", err);
  }
});

client.login(process.env.TOKEN);
