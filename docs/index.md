# Trello Login
In order to use Voice for Trello on your Amazon Alexa device you must login to Amazon and Trello via the buttons below.

<div id="logins">
  <div id="amazon-root"></div>
  <a href="#" id="login_with_amazon">
    <img border="0" alt="Login with Amazon"
      src="https://images-na.ssl-images-amazon.com/images/G/01/lwa/btnLWA_gold_156x32.png"
      width="156" height="32" />
  </a>

  {% capture final_trello_url %}{{ 'https://trello.com/1/authorize?callback_method=fragment&return_url=' }}{{ 'http%3A%2F%2F127.0.0.1%3A4000' }}{{ '&scope=read,write&expiration=never&name=Voice%20for%20Trello&key=' }}{{ site.trelloapikey }}{% endcapture %}
  <li class="custom_button" id="trello_login_button"><a href="{{ final_trello_url }}">Trello Login</a></li>

  <li class="custom_button" id="logout_button"><a>Logout</a></li>
</div>

{:#privacy_policy}
# Privacy Policy

Last updated: June 13, 2017

firebird42 and other contributers ("us", "we", or "our") operates Voice for Trello&trade;, an Amazon Alexa Skill (the "Skill"). This page informs you of our policies regarding the collection, use and disclosure of Personal Information we receive from users of the Skill.

We use your Personal Information only for providing and improving the Skill. By using the Skill, you agree to the collection and use of information in accordance with this policy.

### Information Collection And Use

While using our Skill, we may ask you to provide us with certain personally identifiable information that can be used to identify you. Personally identifiable information may include, but is not limited to your Trello account.

### Security

The security of your Personal Information is important to us, but remember that no method of transmission over the Internet, or method of electronic storage, is 100% secure. While we strive to use commercially acceptable means to protect your Personal Information, we cannot guarantee its absolute security.

### Changes To This Privacy Policy

This Privacy Policy is effective as of June 13, 2017 and will remain in effect except with respect to any changes in its provisions in the future, which will be in effect immediately after being posted on this page.

We reserve the right to update or change our Privacy Policy at any time and you should check this Privacy Policy periodically. Your continued use of the Service after we post any modifications to the Privacy Policy on this page will constitute your acknowledgment of the modifications and your consent to abide and be bound by the modified Privacy Policy.

If we make any material changes to this Privacy Policy, we will notify you either through the email address you have provided us, or by placing a prominent notice on our website.

### Contact Us

If you have any questions about this Privacy Policy, please contact us via the information found on GitHub.
