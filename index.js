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
  if (message.channel.isDMBased()) {
    let threadId = tickets.get(message.author.id);
    let thread;

    const guild = await client.guilds.fetch(GUILD_ID);
    const forum = await guild.channels.fetch(FORUM_CHANNEL_ID);

    if (!threadId) {
      thread = await forum.threads.create({
        name: `ticket-${message.author.username}`,
        message: {
          content: `new thread from **${message.author.tag}**`
        }
      });

      tickets.set(message.author.id, thread.id);

      await message.author.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("<a:b_heels:1501198524782743602>  ⋯ ⠀new thread opened")
            .setDescription(
              "please be patient while waiting for a response.\n" +
              "if needed, ping staff in the server after 24h."
            )
            .setColor(0x000000)
        ]
      });

      await thread.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("new thread <3")
            .setDescription(message.content || "*no text*")
            .setColor(0x000000)
            .setAuthor({
              name: message.author.tag,
              iconURL: message.author.displayAvatarURL()
            })
        ]
      });

      await message.react("<a:wh_envelope:1500252173546557480>");
      return;
    }

    thread = await client.channels.fetch(threadId).catch(() => null);
    if (!thread) return;

    await thread.send({
      embeds: [
        new EmbedBuilder()
          .setDescription(message.content || "*no text*")
          .setColor(0x000000)
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

      await message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("<a:w_bubble:1501198513302667306>  ⋯ ⠀thread closed")
            .setDescription("ticket has been closed by staff.")
            .setColor(0x000000)
        ]
      });

      try {
        await user.send({
          embeds: [
            new EmbedBuilder()
              .setTitle("<a:w_bubble:1501198513302667306>  ⋯ ⠀thread closed")
              .setDescription(
                "this ticket has been closed.\n" +
                "send a new message to open a new thread."
              )
              .setColor(0x000000)
          ]
        });
      } catch {}

      await message.channel.setArchived(true);
      tickets.delete(userId);

      return;
    }

    return;
  }

  // ================= STAFF MESSAGE =================
  try {
    await user.send({
      embeds: [
        new EmbedBuilder()
          .setDescription(message.content)
          .setColor(0xffffff)
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
