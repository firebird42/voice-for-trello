var Alexa = require('alexa-sdk');
var Trello = require('node-trello');
var request = require('request');

var AWS = require('aws-sdk');
var encrypted = process.env.trello_api_key;
let trello_api_key;

exports.handler = (event, context, callback) => {
  if (trello_api_key) {
    console.log(trello_api_key);
    processEvent(event, context, callback);
  } else {
    // Decrypt code should run once and variables stored outside of the function
    // handler so that these are decrypted once per container
    const kms = new AWS.KMS();
    kms.decrypt({ CiphertextBlob: new Buffer(encrypted, 'base64') }, (err, data) => {
      if (err) {
        console.log('Decrypt error:', err);
        return callback(err);
      }
      trello_api_key = data.Plaintext.toString('ascii');
      processEvent(event, context, callback);
    });
  }
};

function processEvent(event, context, callback) {
  trello_api_key = 'a22c6d69c7c3264f73545cd46b8a83e6';
  var alexa = Alexa.handler(event, context, callback);
  alexa.appId = 'amzn1.ask.skill.f3909a50-a6dc-42da-99f7-2fb1a26fd56e';
  alexa.dynamoDBTableName = 'VoiceForTrello';

  alexa.registerHandlers(handlers, startHandlers, newCardHandlers, boardSelectHandlers, listSelectHandlers, createHandlers);
  alexa.execute();
}

var states = {
  START: '_START', // User is selecting which action to take.
  NEWCARD: {
    BOARDSELECT: '_NEWCARD_BOARDSELECT',
    LISTSELECT: '_NEWCARD_LISTSELECT',
    CREATE: '_NEWCARD_CREATE'
  }
};

var authenticate = function() {
  console.log('Authenticating');
  var self = this;

  //Amazon Authorization
  if (!this.event.session.user.accessToken) {
    console.log('No amazon access token');
    this.emit(':tellWithLinkAccountCard', 'To use this skill please use the companion app to link your Amazon account.');
    return;
  }
  else if (!this.attributes.amazon_user_email) {
    //save amazon user email
    console.log('Saving amazon user email');
    var amznProfileURL = 'https://api.amazon.com/user/profile?access_token=';
    amznProfileURL += this.event.session.user.accessToken;
    request(amznProfileURL, function(error, response, body) {
      if (response.statusCode == 200) {
        var profile = JSON.parse(body);
        console.log(profile);
        self.attributes.amazon_user_email = profile.email;
        self.emit(':saveState', true);
      } else {
        console.log('Errror retrieving amazon profile.');
        self.emit(':tell', "I can't connect to Amazon Profile Service right now, please try again later.");
      }
    });
  }

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

  var params = {
    Key: {
      'amazon_user_email': {
        S: this.attributes.amazon_user_email
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
            'amazon_user_email': {
              S: self.attributes.amazon_user_email
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
      else if (!data.Item.trello_token) {
        console.log('No Trello token');
        self.emit(':tellWithCard', 'Please follow the directions in the Alexa companion app to link your Trello account.',
        'Trello Account Linking', 'Please go to firebird42.github.io/voice-for-trello and follow the instructions to link your Trello account.');
      }
      else if (!self.attributes.trelloToken && data.Item.trello_token) {
        self.attributes.trelloToken = data.Item.trello_token.S;
        console.log('Trello token recieved');
        console.log(self.attributes.trelloToken);
      }

      if (self.attributes.trelloToken && !self.attributes.t) {
        try {
          console.log('Creating trello wrapper');
          var t = new Trello(trello_api_key, self.attributes.trelloToken);
          self.attributes.t = t;
          self.emit(':saveState', true);
        } catch (e) {
          console.log('Unable to create trello wrapper, error: ' + e);
          self.emit(':tell', "I'm sorry, something went wrong with authentication, please try again.");
        }
      }
    }
  });
};

var stopIntent = function () {
  this.handler.state = '';
  this.emit(':tell', 'Goodbye!');
};

var handlers = {

  'LaunchRequest': function () {
    console.log('LaunchRequest, no state');
    this.handler.state = states.START;
    this.emitWithState('LaunchRequest');
  },

  'NewCardIntent': function () {
    console.log('NewCardIntent, no state');
    this.handler.state = states.NEWCARD;
    this.emitWithState('NewCardIntent');
  },

  'AMAZON.HelpIntent': function () {
    if (this.handler.state === '') {
      this.handler.state = states.START;
    }
    this.emitWithState('AMAZON.HelpIntent');
  },

  'AMAZON.StopIntent': function () {
    stopIntent.call(this);
  },

  'AMAZON.CancelIntent': function () {
    stopIntent.call(this);
  },

  'Unhandled': function () {
    console.log('Unhandled, no state');
    this.handler.state = states.START;
    this.emitWithState('LaunchRequest');
  }

};

var launchRequest = function () {
  console.log('LaunchRequest, START state');
  if (!this.attributes.t) {
    authenticate.call(this);
  }
  this.emit(':ask', 'Welcome to Voice for Trello! What would you like to do?',
  'All you can do at the moment is create a new card.');
};

var startHandlers = Alexa.CreateStateHandler(states.START, {

  'LaunchRequest': function () {
    launchRequest.call(this);
  },

  'NewCardIntent': function () {
    console.log('NewCardIntent, START state');
    this.handler.state = states.NEWCARD;
    this.emitWithState('NewCardIntent');
  },

  'AMAZON.HelpIntent': function () {
    this.emit(':ask', 'This is Voice for Trello. An Amazon Alexa voice interface for Trello.\
    All you can do at the moment is create a new card.');
  },

  'AMAZON.StopIntent': function () {
    stopIntent.call(this);
  },

  'AMAZON.CancelIntent': function () {
    stopIntent.call(this);
  },

  'Unhandled': function () {
    console.log('Unhandled, START state');
    launchRequest.call(this);
  }

});

var newCardHandlers = Alexa.CreateStateHandler(states.NEWCARD, {

  'NewCardIntent': function () {
    console.log('NewCardIntent, NEWCARD state');
    if (!this.attributes.t) {
      this.handler.state = '';
      authenticate.call(this);
    }
    this.attributes.newCard = {
      'selectedBoard': {
        'name': '',
        'id': ''
      },
      'selectedList': {
        'name': '',
        'id': ''
      },
      'title': '',
      'description': '',
      'label': '',
      'dueDate': null
    };
    this.handler.state = states.NEWCARD.BOARDSELECT;
    this.emitWithState('BoardSelect');
  }

});

var boardSelect = function () {
  console.log('BoardSelect, BOARDSELECT state');
  if (!this.attributes.toSay) {
    this.attributes.toSay = '';
  }
  this.response.speak(this.attributes.toSay + 'Which of your boards would you like to create a card on?');
  this.attributes.toSay = '';
  this.response.listen('Say the name of one of your boards followed by, \"board\".\
  I can also list the names of your boards.');
  this.emit(':responseReady');
};

var boardOptions = function () {
  console.log('BoardOptionsIntent, BOARDSELECT state');
  var t = new Trello(trello_api_key, this.attributes.trelloToken);

  //calls Trello API to list the user's boards
  //TODO: select a specific team's boards or personal boards
  this.attributes.userBoards = [];
  var self = this;
  console.log('Getting user boards');
  t.get('/1/members/me/boards', function(err, data) {
    if (err) {
      console.log('Error occured in getting board list.');
      console.log(err);
      self.emit(':tell', 'There was an error connecting to Trello, please try again later.');
    }
    console.log('Board data');
    console.log(data);
    for (var i = 0; i < data.length; i++) {
      var board = data[i];
      self.attributes.userBoards.push({
        'name': board.name,
        'id': board.id
      });
    }
    console.log('Got user boards');
    console.log(self.attributes.userBoards);

    //add list of boards to response
    console.log('Relaying boards');
    self.attributes.toSay = '';
    self.attributes.toSay += 'Your boards are <break time="0.75s"/> ';
    for (var i = 0; i < self.attributes.userBoards.length; i++) {
      var board = self.attributes.userBoards[i];
      if (i == self.attributes.userBoards.length - 1 && i != 0) {
        self.attributes.toSay += ' and <break time="0.25s"/>';
      }
      self.attributes.toSay += board.name + ' <break time="0.5s"/> ';
    }
    self.attributes.toSay += ' <break time="1.5s"/> ';

    boardSelect.call(self);
  });
};

var boardSelectHandlers = Alexa.CreateStateHandler(states.NEWCARD.BOARDSELECT, {

  'BoardSelect': function () {
    boardSelect.call(this);
  },

  'BoardOptionsIntent': function () {
    boardOptions.call(this);
  },

  'BoardSelectedIntent': function () {
    console.log('BoardSelectedIntent, BOARDSELECT state');
    this.attributes.newCard.selectedBoard.name = this.event.request.intent.slots.board_name.value;
    console.log('Selected Board: ');
    console.log(this.attributes.newCard.selectedBoard.name);

    var checkBoards = function () {
      console.log('checkBoards');
      console.log(this.attributes.userBoards);
      //check if given option is one of the user's boards
      var self = this;
      if (function() {
        for (var i = 0; i < self.attributes.userBoards.length; i++) {
          var board = self.attributes.userBoards[i];
          if (board.name.toUpperCase() == self.attributes.newCard.selectedBoard.name.toUpperCase()) {
            self.attributes.newCard.selectedBoard.id = board.id;
            console.log('Board ID: ');
            console.log(self.attributes.newCard.selectedBoard.id);
            return true;
          }
        }
        return false;
      }()) {
        this.attributes.userBoards = [];
        this.handler.state = states.NEWCARD.LISTSELECT;
        this.emitWithState('ListSelect');
      }
      else {
        this.attributes.toSay = this.attributes.newCard.selectedBoard.name + ' is not one of your boards. ';
        boardSelect.call(this);
      }
    };

    var t = new Trello(trello_api_key, this.attributes.trelloToken);
    if (!this.attributes.userBoards) {
      this.attributes.userBoards = [];
      var self = this;
      t.get('/1/members/me/boards', function(err, data) {
        if (err) {
          console.log('Error occured in getting board list.');
          console.log(err);
          self.emit(':tell', 'There was an error connecting to Trello, please try again later.');
        }
        for (var i = 0; i < data.length; i++) {
          var board = data[i];
          self.attributes.userBoards.push({
            'name': board.name,
            'id': board.id
          });
        }
        checkBoards.call(self);
      });
    }
    else {
      checkBoards.call(this);
    }
  },

  'AMAZON.HelpIntent': function () {
    console.log('HelpIntent, BOARDSELECT state');
    boardOptions.call(this);
  },

  'AMAZON.StopIntent': function () {
    stopIntent.call(this);
  },

  'AMAZON.CancelIntent': function () {
    this.handler.state = states.START;
    this.emitWithState('LaunchRequest');
  },

  'Unhandled': function () {
    console.log('Unhandled, BOARDSELECT state');
    boardSelect.call(this);
  }

});

var listSelect = function () {
  console.log('ListSelect, LISTSELECT state');
  console.log('Board ID: ');
  console.log(this.attributes.newCard.selectedBoard.id);
  if (!this.attributes.toSay) {
    this.attributes.toSay = '';
  }
  this.response.speak(this.attributes.toSay + 'Which list would you like to create a card on?');
  this.attributes.toSay = '';
  this.response.listen('Say the name of one of your lists followed by, \"list\".\
  I can also list the names of your lists.');
  this.emit(':responseReady');
};

var listOptions = function() {
  console.log('ListOptionsIntent, LISTSELECT state');
  var t = new Trello(trello_api_key, this.attributes.trelloToken);

  console.log('Board ID: ');
  console.log(this.attributes.newCard.selectedBoard.id);
  //calls Trello API to list the user's lists on the selected board
  var self = this;
  t.get('/1/boards/' + this.attributes.newCard.selectedBoard.id + '/lists', function(err, data) {
    if (err) {
      console.log('Error occured in getting list list.');
      console.log(err);
      self.emit(':tell', 'There was an error connecting to Trello, please try again later.');
    }
    self.attributes.userLists = [];
    for (var i = 0; i < data.length; i++) {
      var list = data[i];
      self.attributes.userLists.push({
        'name': list.name,
        'id': list.id
      });
    }
    //add list of lists to response
    self.response.speak('Your lists are: ');
    for (var i = 0; i < self.attributes.userLists.length; i++) {
      var list = self.attributes.userLists[i];
      if (i == self.attributes.userLists.length - 1 && i != 0) {
        self.attributes.toSay += ' and <break time="0.25s"/>';
      }
      self.attributes.toSay += list.name + ' <break time="0.5s"/> ';
    }
    self.attributes.toSay += ' <break time="1.5s"/> ';

    listSelect.call(self);
  });
};

var listSelectHandlers = Alexa.CreateStateHandler(states.NEWCARD.LISTSELECT, {

  'ListSelect': function () {
    listSelect.call(this);
  },

  'ListOptionsIntent': function () {
    listOptions.call(this);
  },

  'ListSelectedIntent': function () {
    console.log('ListSelectedIntent, LISTSELECT state');
    this.attributes.newCard.selectedList.name = this.event.request.intent.slots.list_name.value;

    var checkLists = function () {
      console.log('checkLists');
      //console.log('Board ID: ');
      //console.log(this.attributes.newCard.selectedBoard.id);
      //check if given option is one of the user's list on the selected board
      var self = this;
      if (function() {
        for (var i = 0; i < self.attributes.userLists.length; i++) {
          var list = self.attributes.userLists[i];
          if (list.name.toUpperCase() == self.attributes.newCard.selectedList.name.toUpperCase()) {
            self.attributes.newCard.selectedList.id = list.id;
            return true;
          }
        }
        return false;
      }()) {
        this.attributes.userLists = [];
        this.handler.state = states.NEWCARD.CREATE;
        this.emitWithState('GetTitle');
      }
      else {
        this.attributes.toSay = this.attributes.newCard.selectedList.name + ' is not one of your lists on your ' +
        this.attributes.newCard.selectedBoard.name + ' board.';
        listSelect.call(this);
      }
    };

    var t = new Trello(trello_api_key, this.attributes.trelloToken);
    if (!this.attributes.userLists) {
      this.attributes.userLists = [];
      var self = this;
      t.get('/1/boards/' + this.attributes.newCard.selectedBoard.id + '/lists', function(err, data) {
        if (err) {
          console.log('Error occured in getting list list.');
          console.log(err);
          self.emit(':tell', 'There was an error connecting to Trello, please try again later.');
        }
        for (var i = 0; i < data.length; i++) {
          var list = data[i];
          self.attributes.userLists.push({
            'name': list.name,
            'id': list.id
          });
        }
        checkLists.call(self);
      });
    }
    else {
      checkLists.call(this);
    }
  },

  'AMAZON.HelpIntent': function () {
    listOptions.call(this);
  },

  'AMAZON.StopIntent': function () {
    stopIntent.call(this);
  },

  'AMAZON.CancelIntent': function () {
    this.handler.state = states.NEWCARD.BOARDSELECT;
    this.emitWithState('BoardSelect');
  },

  'Unhandled': function () {
    console.log('Unhandled, LISTSELECT state');
    listSelect.call(this);
  }

});

var additionalCardFeatures = function () {
  console.log('AdditionalCardFeaturesIntent, CREATE state');
  if (!this.attributes.newCard.title) {
    this.attributes.newCard.title = this.event.request.intent.slots.title.value;
  }
  console.log('New card title: ');
  console.log(this.attributes.newCard.title);
  var newCardHas = {
    'description': (this.attributes.newCard.description) ? true : false,
    'label': (this.attributes.newCard.label) ? true : false,
    'dueDate': (this.attributes.newCard.dueDate) ? true : false
  };
  if (function () {
    var newCardEmpty = true;
    for (var key in newCardHas) {
      if (key) {
        newCardEmpty = false;
      }
    }
    return newCardEmpty;
  }()) {
    this.attributes.toSay = '';
    this.attributes.toSay += 'Would you like to add a';
    if (!newCardHas.description) {
      this.attributes.toSay += ' description,';
    }
    if (!newCardHas.label) {
      if (newCardHas.dueDate && !newCardHas.description) {
        this.attributes.toSay += ' or';
      }
      this.attributes.toSay += ' label,';
    }
    if (!newCardHas.dueDate) {
      if (!newCardHas.description || !newCardHas.label) {
        this.attributes.toSay += ' or';
      }
      this.attributes.toSay += ' due date';
    }
    this.attributes.toSay += '?';
    this.response.speak(this.attributes.toSay);
    this.attributes.toSay = '';
    this.response.listen('Please say no, description, label, or duedate.');
    this.emit(':responseReady');
  }
  else {
    sendCard.call(this);
  }
};

var askLabel = function () {
  if (!this.attributes.toSay) {
    this.attributes.toSay = '';
  }
  console.log('AskLabelIntent, CREATE state');
  this.response.speak(this.attributes.toSay + 'What label would you like to add to the card?');
  this.attributes.toSay = '';
  this.response.listen('I can also list labels from your board.');
  this.emit(':responseReady');
};

var sendCard = function () {
  console.log('createCard, CREATE state');
  //Send new card to Trello
  var t = new Trello(trello_api_key, this.attributes.trelloToken);
  t.post('/1/cards',
  {
    name: this.attributes.newCard.title,
    desc: this.attributes.newCard.description,
    due: (this.attributes.newCard.dueDate) ? this.attributes.newCard.dueDate.toJSON() : null,
    idList: this.attributes.newCard.selectedList.id,
    idLabels: this.attributes.newCard.label
  }, function(err, data) {
    if (err) {
      console.log('Error occured in getting list list.');
      console.log(err);
      this.emit(':tell', 'There was an error connecting to Trello, please try again later.');
    }
    console.log(data);
  });
  this.emit(':tell', 'Card Added! Thank you for using Voice for Trello!');
};

var createHandlers = Alexa.CreateStateHandler(states.NEWCARD.CREATE, {

  'GetTitle': function () {
    console.log('GetTitle, CREATE state');
    this.emit(':ask', 'What is the title of the new card?', 'Prepend your title with: The title is ');
  },

  'AdditionalCardFeaturesIntent': function () {
    additionalCardFeatures.call(this);
  },

  'AskDescriptionIntent': function () {
    console.log('AskDescriptionIntent, CREATE state');
    this.emit(':ask', 'What\'s the description?', 'What is the description for the new card?');
  },

  'ReceivedDescriptionIntent': function () {
    console.log('ReceivedDescriptionIntent, CREATE state');
    this.attributes.newCard.description = this.event.request.intent.slots.description.value;

    additionalCardFeatures.call(this);
  },

  'AskLabelIntent': function () {
    askLabel.call(this);
  },

  'LabelOptionsIntent': function () {
    console.log('LabelOptionsIntent, CREATE state');
    var t = new Trello(trello_api_key, this.attributes.trelloToken);

    //Get labels from board
    this.attributes.userLabels = [];
    var self = this;
    t.get('/1/boards/' + this.attributes.newCard.selectedBoard.id + '/labels', function(err, data) {
      if (err) {
        console.log('Error occured in getting list list.');
        console.log(err);
        self.emit(':tell', 'There was an error connecting to Trello, please try again later.');
      }
      for (var i = 0; i < data.length; i++) {
        var label = data[i];
        self.attributes.userLabels.push({
          'name': label.name,
          'id': label.id,
          'color': label.color
        });
      }

      this.attributes.toSay = 'Labels on your ' + this.attributes.newCard.board + ' are <break time="0.25s"/> ';
      for (var i = 0; i < this.attributes.userLabels.length; i++) {
        var label = this.attributes.userLabels[i];
        this.attributes.toSay += (label.name) ? label.name : label.color + ' <break time="0.75"/>';
      }

      askLabel.call(this);
    });
  },

  'ReceivedLabelIntent': function () {
    console.log('ReceivedLabelIntent, CREATE state');
    //TODO: add multiple labels to the new card

    var checkLabels = function () {
      //check if given option is one of the user's list on the selected board
      var self = this;
      if (function() {
        for (var i = 0; i < self.attributes.userLabels.length; i++) {
          var label = self.attributes.userLabels[i];
          if ((label.name) ? label.name.toUpperCase() : label.color.toUpperCase() == self.event.request.intent.slots.label.value.toUpperCase()) {
            self.attributes.newCard.label = label.id;
            return true;
          }
        }
        return false;
      }()) {
        this.attributes.userLabels = [];
        this.emit('AdditionalCardFeaturesIntent');
      }
      else {
        this.attributes.toSay = 'That label is not one of your labels on your ' +
        this.attributes.newCard.selectedBoard.name + ' board.';
      }
      askLabel.call(this);
    };

    if (!this.attributes.userLabels) {
      this.attributes.userLabels = [];
      t.get('/1/boards/' + this.attributes.newCard.selectedBoard.id + '/labels', function(err, data) {
        if (err) {
          console.log('Error occured in getting list list.');
          console.log(err);
          this.emit(':tell', 'There was an error connecting to Trello, please try again later.');
        }
        for (var i = 0; i < data.length; i++) {
          var label = data[i];
          this.attributes.userLabels.push({
            'name': label.name,
            'id': label.id,
            'color': label.color
          });
        }
        checkLabels.call(this);
      });
    }
    else {
      checkLabels.call(this);
    }
  },

  'AskDueDateIntent': function () {
    console.log('AskDueDateIntent, CREATE state');
    this.emit(':ask', 'What is the due date for the card?', 'What is the due date for the new card?');
  },

  'ReceivedDueDateIntent': function () {
    console.log('ReceivedDueDateIntent, CREATE state');
    this.attributes.newCard.dueDate = new Date(this.event.request.intent.slots.due_date.value);

    additionalCardFeatures.call(this);
  },

  'AMAZON.NoIntent': function () {
    sendCard.call(this);
  },

  'AMAZON.HelpIntent': function () {
    if (!this.attributes.newCard.title) {
      this.emit(':ask', 'What is the title of the new card?', 'Prepend your title with: The title is ');
    }
    else {
      additionalCardFeatures.call(this);
    }
  },

  'AMAZON.StopIntent': function () {
    stopIntent.call(this);
  },

  'AMAZON.CancelIntent': function () {
    this.handler.state = states.NEWCARD.LISTSELECT;
    this.emitWithState('ListSelect');
  },

  'Unhandled': function () {
    if (!this.attributes.newCard.title) {
      this.emit(':ask', 'What is the title of the new card?', 'Prepend your title with: The title is ');
    }
    else {
      additionalCardFeatures.call(this);
    }
  }

});
