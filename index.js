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

// ================= BOT =================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User]
});

// ================= CONFIG =================
const GUILD_ID = "1387525349222645873";
const FORUM_CHANNEL_ID = "1504256009365885029";
const STAFF_ROLE_ID = "1500489431918837861";

// ================= MEMORY =================
const tickets = new Map();

// ================= READY =================
client.once("ready", () => {
  console.log(`READY: ${client.user.tag}`);

  client.user.setPresence({
    activities: [{ name: "dm me for inquiries" }],
    status: "online"
  });
});

// ================= MAIN =================
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  try {

    // ================= USER DM =================
    if (!message.guild) {

      const guild = await client.guilds.fetch(GUILD_ID);
      const forum = await guild.channels.fetch(FORUM_CHANNEL_ID);

      let ticket = tickets.get(message.author.id);
      let thread;

      // EXISTING THREAD
      if (ticket) {
        thread = await client.channels.fetch(ticket.threadId).catch(() => null);

        if (thread) {
          await thread.send({
            embeds: [
              new EmbedBuilder()
                .setDescription(message.content || "*no text*")
                .setColor(0x90EE90)
                .setAuthor({
                  name: message.author.tag,
                  iconURL: message.author.displayAvatarURL()
                })
            ]
          });

          return;
        }
      }

      // CREATE THREAD
      thread = await forum.threads.create({
        name: `ticket-${message.author.username}`,
        message: {
          content: `new thread from **${message.author.tag}**`
        }
      });

      tickets.set(message.author.id, {
        threadId: thread.id
      });

      // DM user
      try {
        await message.author.send({
          embeds: [
            new EmbedBuilder()
              .setTitle("new thread opened")
              .setDescription("please wait for staff reply")
              .setColor(0x90EE90)
          ]
        });
      } catch (err) {
        console.log("DM failed:", err);
      }

      // THREAD MESSAGE
      await thread.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("new message")
            .setDescription(message.content || "*no text*")
            .setColor(0x90EE90)
            .setAuthor({
              name: message.author.tag,
              iconURL: message.author.displayAvatarURL()
            })
        ]
      });

      return;
    }

    // ================= STAFF REPLIES =================
    if (!message.guild) return;

    const isThread =
      message.channel.type === ChannelType.PublicThread ||
      message.channel.type === ChannelType.PrivateThread;

    if (!isThread) return;

    if (!message.member?.roles.cache.has(STAFF_ROLE_ID)) return;

    const ticket = [...tickets.values()]
      .find(t => t.threadId === message.channel.id);

    if (!ticket) return;

    const userId = [...tickets.entries()]
      .find(([_, v]) => v.threadId === message.channel.id)?.[0];

    if (!userId) return;

    const user = await client.users.fetch(userId).catch(() => null);
    if (!user) return;

    // CLOSE
    if (message.content === "!close") {
      await message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("thread closed")
            .setDescription("ticket closed by staff")
            .setColor(0x90EE90)
        ]
      });

      try {
        await user.send({
          embeds: [
            new EmbedBuilder()
              .setTitle("ticket closed")
              .setDescription("you may open a new ticket anytime.")
              .setColor(0x90EE90)
          ]
        });
      } catch {}

      tickets.delete(userId);

      await message.channel.setArchived(true);
      await message.channel.setLocked(true);

      return;
    }

    // STAFF REPLY → USER
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
    console.log("ERROR:", err);
  }
});

client.login(process.env.TOKEN);
