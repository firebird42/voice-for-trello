var trello_cookie = 'trello_token';
var amazon_cookie = 'amazon_user_id';

//setup login with amazon
window.onAmazonLoginReady = function() {
  amazon.Login.setClientId('amzn1.application-oa2-client.e0e8326418124f97946f50b507f781cb');
};
(function(d) {
  var a = d.createElement('script'); a.type = 'text/javascript';
  a.async = true; a.id = 'amazon-login-sdk';
  a.src = 'https://api-cdn.amazon.com/sdk/login1.js';
  d.getElementById('amazon-root').appendChild(a);
})(document);

window.onload = function() {
  var trello_token = window.location.href.split('token=')[1];
  if (trello_token) {
    setCookie(trello_cookie, trello_token);
  }

  //If user is logged into Amazon and Trello, send data to DynamoDB
  if (getCookie(trello_cookie) && getCookie(amazon_cookie)) {
    //configure AWS
    AWS.config.update({
      region: 'us-east-1',
      //endpoint: 'dynamodb.us-east-1.amazonaws.com',
      credentials: new AWS.CognitoIdentityCredentials({
        IdentityPoolId: 'us-east-1:9eb70423-1029-47f7-aa2d-094c03fdfec9'
      })
    });
    AWS.config.credentials.get(function(err) {
      if (err) {
        console.log('Error occured with getting AWS credentials.');
        console.log(err, err.stack);
      }
    });

    var dynamodb = new AWS.DynamoDB({region: 'us-east-1'});

    //find correct user
    var params = {
      Key: {
        'amazon_user_id': {
          S: getCookie(amazon_cookie)
        }
      },
      TableName: 'VoiceForTrelloAccounts'
    };
    dynamodb.getItem(params, function(err, data) {
      if (err) {
        console.log('Error in finding account');
        console.log(err, err.stack);
      }
      else {
        console.log(data);
        if (!data.Item) {
          console.log('Creating new Voice for Trello account');
          params = {
            Item: {
              'amazon_user_id': {
                S: getCookie(amazon_cookie)
              }
            },
            TableName: 'VoiceForTrelloAccounts'
          };
          dynamodb.putItem(params, function(err, data) {
            if (err) {
              console.log('Error in creating new account');
              console.log(err, err.stack);
            }
          });
        }
      }
    });

    params = {
      ExpressionAttributeNames: {
        '#T': 'trello_token'
      },
      ExpressionAttributeValues: {
        ':token': {
          S: getCookie(trello_cookie)
        }
      },
      Key: {
        'userId': {
          S: getCookie(amazon_cookie)
        }
      },
      ReturnValues: 'NONE',
      TableName: 'VoiceForTrelloAccounts',
      UpdateExpression: 'SET #T = :token'
    };
    dynamodb.updateItem(params, function(err, data) {
      if (err) {
        console.log(err, err.stack);
      }
      else {
        console.log('Trello token to DynamoDB success!');
        alert('You have been successfully logged in.')
      }
    });
  }
};

document.getElementById('login_with_amazon').onclick = function() {
  var options = {
    interactive : 'auto',
    popup : true,
    scope : 'profile:user_id'
  };
  amazon.Login.authorize(options, function(response){
    if (response.error) {
      alert('Something went wrong with the Login with Amazon process. Please try again.');
      return;
    }
    amazon.Login.retrieveProfile(response.access_token, function(response) {
      if (response.error) {
        alert('Something went wrong with the Login with Amazon process. Please try again.');
        return;
      }
      setCookie(amazon_cookie, response.profile.CustomerId);
    });
  });
  return false;
};

document.getElementById('logout_button').onclick = function() {
  amazon.Login.logout();
  deleteCookie(trello_cookie);
  deleteCookie(amazon_cookie);
  alert('You have been successfully logged out.');
};


//cookie functions
function setCookie(name, value) {
  document.cookie = name + "=" + value + ";path=/";
}
function getCookie(cookieName) {
  var name = cookieName + "=";
  var cookieArray = document.cookie.split(';');
  for(var i = 0; i < cookieArray.length; i++) {
    var cookie = cookieArray[i];
    while (cookie.charAt(0) == ' ') {
      cookie = cookie.substring(1);
    }
    if (cookie.indexOf(name) === 0) {
      return cookie.substring(name.length, cookie.length);
    }
  }
  return "";
}
function deleteCookie(name) {
    document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:01 GMT;';
}
