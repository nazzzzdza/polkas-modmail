// ================= STAFF → USER =================
if (!message.guild) return;

const isThread =
  message.channel.type === ChannelType.PublicThread ||
  message.channel.type === ChannelType.PrivateThread;

if (!isThread) return;

if (!message.member?.roles.cache.has(STAFF_ROLE_ID)) return;

// find ticket
const entry = [...tickets.entries()]
  .find(([_, threadId]) => threadId === message.channel.id);

if (!entry) return;

const userId = entry[0];
const user = await client.users.fetch(userId);

const content = message.content?.trim();

// ================= COMMAND HANDLER (BLOCK FIRST) =================
if (content.startsWith("!")) {

  // ===== CLOSE COMMAND =====
  if (content === "!close") {
    const closeEmbed = new EmbedBuilder()
      .setTitle("🔒 Ticket Closed")
      .setDescription(
        "This ticket has been closed by staff.\n\n" +
        "Send another message anytime to open a new ticket."
      )
      .setColor("Red");

    await message.channel.send({ embeds: [closeEmbed] });

    try {
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

  // block all other commands (!r etc)
  return;
}

// ================= NORMAL STAFF MESSAGE =================
try {
  await user.send(`💬 Staff: ${message.content}`);
} catch (err) {
  console.log("DM failed:", err);
}
