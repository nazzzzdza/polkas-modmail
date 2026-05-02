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

// CUSTOM COLORS (change this)
const EMBED_COLOR = 0x9b59b6; // purple

const tickets = new Map();

// ================= READY =================
client.once("ready", () => {
  console.log(`READY: ${client.user.tag}`);

  client.user.setPresence({
    activities: [
      {
        name: "dm me for support <3",
        type: 1,
        url: "https://twitch.tv/discord"
      }
    ],
    status: "online"
  });
});

// ================= MAIN =================
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  // ================= USER DM =================
  if (message.channel.type === ChannelType.DM) {
    let threadId = tickets.get(message.author.id);
    let thread;

    const guild = await client.guilds.fetch(GUILD_ID);
    const forum = await guild.channels.fetch(FORUM_CHANNEL_ID);

    // CREATE TICKET
    if (!threadId) {
      thread = await forum.threads.create({
        name: `ticket-${message.author.username}`,
        message: {
          content: `📩 New ticket from **${message.author.tag}**`
        }
      });

      tickets.set(message.author.id, thread.id);

      // FIRST DM CONFIRMATION (NEW)
      await message.author.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("📩 Ticket Created")
            .setDescription("Your message has been sent to staff. Please wait for a response.")
            .setColor(EMBED_COLOR)
        ]
      });

      // STAFF SIDE FIRST MESSAGE
      await thread.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("New Ticket")
            .setDescription(message.content || "*no text*")
            .setColor(EMBED_COLOR)
            .setAuthor({
              name: message.author.tag,
              iconURL: message.author.displayAvatarURL()
            })
        ]
      });

      await message.react("📩");
      return;
    }

    thread = await client.channels.fetch(threadId);
    if (!thread) return;

    await thread.send({
      embeds: [
        new EmbedBuilder()
          .setDescription(message.content || "*no text*")
          .setColor(EMBED_COLOR)
          .setAuthor({
            name: message.author.tag,
            iconURL: message.author.displayAvatarURL()
          })
      ]
    });

    return;
  }

  // ================= STAFF =================
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

  let user;
  try {
    user = await client.users.fetch(userId);
  } catch {
    return;
  }

  // ================= COMMANDS =================
  if (content.startsWith("!")) {

    if (content === "!close") {

      // STAFF CLOSE EMBED
      await message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("🔒 Ticket Closed")
            .setDescription("This ticket has been closed by staff.")
            .setColor(EMBED_COLOR)
        ]
      });

      // USER CLOSE EMBED
      try {
        await user.send({
          embeds: [
            new EmbedBuilder()
              .setTitle("🔒 Ticket Closed")
              .setDescription("Your ticket has been closed. You can send a new message anytime to open a new one.")
              .setColor(EMBED_COLOR)
          ]
        });
      } catch {}

      await message.channel.setArchived(true);
      tickets.delete(userId);

      return;
    }

    return;
  }

  // ================= STAFF MESSAGE (EMBED VERSION) =================
  try {
    await user.send({
      embeds: [
        new EmbedBuilder()
          .setDescription(message.content)
          .setColor(EMBED_COLOR)
          .setAuthor({
            name: message.author.tag,
            iconURL: message.author.displayAvatarURL()
          })
      ]
    });
  } catch (err) {
    console.log("DM failed:", err);
  }
});

client.login(process.env.TOKEN);
