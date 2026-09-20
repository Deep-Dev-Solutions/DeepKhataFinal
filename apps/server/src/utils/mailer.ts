import nodemailer from "nodemailer";

// Configure Nodemailer to point to local Mailpit
const transporter = nodemailer.createTransport({
  host: "127.0.0.1",
  port: 1025,
  secure: false, 
});

export const sendInviteEmail = async (toEmail: any, role: any, token: any) => {

  const inviteLink = `http://localhost:3000/join?token=${token}`;

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
      <h2>You have been invited to BizFlow!</h2>
      <p>You have been invited to join a workspace as a <strong>${role}</strong>.</p>
      <p>Click the button below to accept the invitation and set up your account:</p>
      <a href="${inviteLink}" style="display: inline-block; padding: 10px 20px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 5px; margin-top: 10px;">
        Accept Invitation
      </a>
      <p style="margin-top: 20px; font-size: 12px; color: #888;">If you did not expect this, please ignore this email.</p>
    </div>
  `;

  await transporter.sendMail({
    from: '"BizFlow Admin" <noreply@bizflow.com>',
    to: toEmail,
    subject: "Invitation to join BizFlow Workspace",
    html: htmlContent,
  });
};

