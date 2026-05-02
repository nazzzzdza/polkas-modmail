const express = require("express");
const app = express();

app.get("/", (req, res) => {
  res.send("Bot is running!");
});

app.listen(3000, () => {
  console.log("Web server running on port 3000");
});

const {
  Client,
  GatewayIntentBits,
  Partials,
  ChannelType,
  EmbedBuilder
} = require("discord.js");

const { createClient } = require("@supabase/supabase-js");

// ===== CONFIG =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const GUILD_ID = "1461112510798233927";
const FORUM_CHANNEL_ID = "1500206600529641482";
const STAFF_ROLE_ID = "1461112511301685296";

// ===== READY =====
client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// ===== GET OR CREATE TICKET =====
async function getOrCreateTicket(user, message) {
  let { data: ticket } = await supabase
    .from("tickets")
    .select("*")
    .eq("user_id", user.id)
    .eq("open", true)
    .single();

  if (!ticket) {
    const guild = await client.guilds.fetch(GUILD_ID);
    const forum = await guild.channels.fetch(FORUM_CHANNEL_ID);

    const thread = await forum.threads.create({
      name: `ticket-${user.username}`,
      message: {
        content: `<@&${STAFF_ROLE_ID}> New ticket from ${user.tag}`,
        embeds: [
          new EmbedBuilder()
            .setTitle("New Ticket")
            .setDescription("Support will respond shortly.")
            .setColor("Blue")
        ]
      }
    });

    const { data: newTicket } = await supabase
      .from("tickets")
      .insert({
        user_id: user.id,
        thread_id: thread.id,
        open: true
      })
      .select()
      .single();

    await user.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("Ticket Opened")
          .setDescription("Your message has been sent to staff.")
          .setColor("Green")
      ]
    });

    await message.react("📩");

    return newTicket;
  }

  return ticket;
}

// ===== MAIN MESSAGE HANDLER =====
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  // =========================
  // USER DM → STAFF THREAD
  // =========================
  if (message.channel.type === ChannelType.DM) {
    const ticket = await getOrCreateTicket(message.author, message);

    const thread = await client.channels.fetch(ticket.thread_id);

    if (!thread) return;

    await thread.send({
      content: `**${message.author.tag}:** ${message.content}`,
      files: [...message.attachments.values()]
    });

    await supabase.from("messages").insert({
      ticket_id: ticket.id,
      author_id: message.author.id,
      content: message.content,
      attachments: JSON.stringify([...message.attachments.values()].map(a => a.url))
    });
  }

  // =========================
  // STAFF THREAD COMMANDS
  // =========================
  if (!message.guild) return;
  if (message.channel.type !== ChannelType.GuildPublicThread &&
      message.channel.type !== ChannelType.GuildPrivateThread) return;

  if (!message.member) return;

  if (!message.member.roles.cache.has(STAFF_ROLE_ID)) return;

  const { data: ticket } = await supabase
    .from("tickets")
    .select("*")
    .eq("thread_id", message.channel.id)
    .single();

  if (!ticket) return;

  const user = await client.users.fetch(ticket.user_id);

  // =========================
  // REPLY COMMAND
  // =========================
  if (message.content.startsWith("!r ")) {
    const reply = message.content.slice(3);

    try {
      await user.send(reply);
    } catch (err) {
      console.log("DM failed:", err);
    }

    await supabase.from("messages").insert({
      ticket_id: ticket.id,
      author_id: message.author.id,
      content: reply
    });
  }

  // =========================
  // EDIT (simple resend)
  // =========================
  if (message.content.startsWith("!edit ")) {
    const newContent = message.content.slice(6);

    try {
      await user.send(`✏️ Edited: ${newContent}`);
    } catch (err) {
      console.log("DM edit failed:", err);
    }
  }

  // =========================
  // CLOSE TICKET
  // =========================
  if (message.content === "!close") {
    try {
      await user.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("Ticket Closed")
            .setDescription("Your ticket has been resolved.")
            .setColor("Red")
        ]
      });
    } catch (err) {
      console.log("Close DM failed:", err);
    }

    await supabase
      .from("tickets")
      .update({ open: false })
      .eq("id", ticket.id);

    const { data: messages } = await supabase
      .from("messages")
      .select("*")
      .eq("ticket_id", ticket.id);

    let transcript = (messages || [])
      .map(m => `${m.author_id}: ${m.content}`)
      .join("\n");

    await message.channel.send({
      content: "📄 Transcript:\n```" + transcript + "```"
    });

    await message.channel.setLocked(true);
    await message.channel.setArchived(true);
  }
});

client.login(process.env.TOKEN);
