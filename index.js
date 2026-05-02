const express = require("express");
const app = express();

app.get("/", (req, res) => res.send("Bot running"));

app.listen(3000, () => console.log("Web OK"));

const {
  Client,
  GatewayIntentBits,
  Partials,
  ChannelType,
  EmbedBuilder
} = require("discord.js");

const { createClient } = require("@supabase/supabase-js");

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

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// CONFIG
const GUILD_ID = "1461112510798233927";
const FORUM_CHANNEL_ID = "1500206600529641482";
const STAFF_ROLE_ID = "1461112511301685296";

client.once("ready", () => {
  console.log("READY:", client.user.tag);
});

// ================= DM → THREAD =================
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  // USER DM
  if (message.channel.type === ChannelType.DM) {
    let { data: ticket } = await supabase
      .from("tickets")
      .select("*")
      .eq("user_id", message.author.id)
      .eq("open", true)
      .single();

    let thread;

    if (!ticket) {
      const guild = await client.guilds.fetch(GUILD_ID);
      const forum = await guild.channels.fetch(FORUM_CHANNEL_ID);

      thread = await forum.threads.create({
        name: `ticket-${message.author.username}`,
        message: {
          content: `New ticket from ${message.author.tag}`
        }
      });

      const { data: newTicket } = await supabase
        .from("tickets")
        .insert({
          user_id: message.author.id,
          thread_id: thread.id,
          open: true
        })
        .select()
        .single();

      await thread.send(
        `📩 **First message:** ${message.content || "*no text*"}`
      );

      await message.react("📩");
      return;
    }

    thread = await client.channels.fetch(ticket.thread_id);

    await thread.send(
      `**${message.author.tag}:** ${message.content || "*no text*"}`
    );

    await supabase.from("messages").insert({
      ticket_id: ticket.id,
      author_id: message.author.id,
      content: message.content
    });
  }

  // ================= THREAD → USER =================
  if (!message.guild) return;

  const isThread =
    message.channel.type === ChannelType.PublicThread ||
    message.channel.type === ChannelType.PrivateThread;

  if (!isThread) return;

  const member = message.member;
  if (!member?.roles.cache.has(STAFF_ROLE_ID)) return;

  const { data: ticket } = await supabase
    .from("tickets")
    .select("*")
    .eq("thread_id", message.channel.id)
    .single();

  if (!ticket) return;

  const user = await client.users.fetch(ticket.user_id);

  try {
    await user.send(`💬 Staff: ${message.content}`);
  } catch (err) {
    console.log("DM FAILED:", err);
  }

  await supabase.from("messages").insert({
    ticket_id: ticket.id,
    author_id: message.author.id,
    content: message.content
  });

  // CLOSE
  if (message.content === "!close") {
    await user.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("Ticket Closed")
          .setDescription("Your ticket has been closed.")
          .setColor("Red")
      ]
    });

    await supabase
      .from("tickets")
      .update({ open: false })
      .eq("id", ticket.id);

    await message.channel.setArchived(true);
  }
});

client.login(process.env.TOKEN);
