var Alexa = require('alexa-sdk');
var Trello = require('node-trello');
var request = require('request');

var AWS = require('aws-sdk');
var encrypted = process.env.trello_api_key;
let trello_api_key;

exports.handler = (event, context, callback) => {
  if (trello_api_key) {
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

  //Amazon Authorization
  if (!this.event.session.user.accessToken) {
    console.log('No amazon access token');
    this.emit(':tellWithLinkAccountCard', 'To use this skill please use the companion app to link your Amazon account.');
    return;
  }
  else if (!this.attributes.amazon_user_id) {
    //save amazon userId
    console.log('Saving amazon user id');
    var amznProfileURL = 'https://api.amazon.com/user/profile?access_token=';
    amznProfileURL += this.event.session.user.accessToken;
    var self = this;
    request(amznProfileURL, function(error, response, body) {
      if (response.statusCode == 200) {
        var profile = JSON.parse(body);
        console.log(profile);
        self.attributes.amazon_user_id = profile.user_id;
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
      'amazon_user_id': {
        S: this.attributes.amazon_user_id
      }
    },
    TableName: 'VoiceForTrelloAccounts'
  };
  var self = this;
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
              S: self.attributes.amazon_user_id
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
      else if (data.Item.trello_token) {
        self.attributes.trelloToken = data.Item.trello_token.S;
        console.log('Trello token recieved');
      }
    }
  });

  //Trello authorization
  if (!this.attributes.trelloToken) {
    this.emit(':tellWithCard', 'Please follow the directions in the Alexa companion app to link your Trello account.',
    'Trello Account Linking', 'Please go to firebird42.github.io/voice-for-trello and follow the instructions to link your Trello account.');
  }
  else if (!this.attributes.t) {
    this.handler.state = '';
    try {
      var t = new Trello(trello_api_key, this.attributes.trelloToken);
      this.attributes.t = t;
    } catch (e) {
      console.log('Unable to create trello wrapper, error: ' + e);
      this.emit(':tell', "I'm sorry, something went wrong with authorization, please try again.");
    }
  }
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
    this.emit(':tell', 'Goodbye!');
  },

  'AMAZON.CancelIntent': function () {

  }

};

var startHandlers = Alexa.CreateStateHandler(states.START, {

  'LaunchRequest': function () {
    console.log('LaunchRequest, START state');
    if (!this.attributes.t) {
      authenticate.call(this);
    } else {
      this.emit(':ask', 'Welcome to Voice for Trello! What would you like to do?',
      'All you can do at the moment is create a new card.');
    }
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
    this.emit('AMAZON.StopIntent');
  },

  'AMAZON.CancelIntent': function () {

  }

});

var newCardHandlers = Alexa.CreateStateHandler(states.NEWCARD, {

  'NewCardIntent': function () {
    console.log('NewCardIntent, NEWCARD state');
    if (!this.attributes.t) {
      this.handler.state = '';
      authenticate.call(this);
    } else {
      this.attributes.newCard = {
        'selectedBoard': '',
        'selectedList': '',
        'title': '',
        'description': '',
        'label': '',
        'checklist': [],
        'dueDate': null
      };
      this.handler.state = states.NEWCARD.BOARDSELECT;
      this.emitWithState('BoardSelect');
    }
  }

});

var boardSelectHandlers = Alexa.CreateStateHandler(states.NEWCARD.BOARDSELECT, {

  'BoardSelect': function () {
    cosnole.log('BoardSelect, board select state');
    this.response.speak('Which of your boards would you like to create a card on?');
    this.response.listen('Say the name of one of your boards followed by, \"board\".\
    I can also list the names of your boards.');
    this.emit(':responseReady');
  },

  'BoardOptionsIntent': function () {
    //calls Trello API to list the user's boards
    //TODO: select a specific team's boards or personal boards

    //add list of boards to response
    this.response.speak('Your boards are: ');
    for (var board in userBoards) {
      this.response.speak(board);
    }

    this.emit('BoardSelect');
  },

  'BoardSelectedIntent': function () {
    this.attributes.newCard.selectedBoard = this.event.request.intent.slots.board_name.value;

    //check if given option is one of the user's boards
    if (userBoards.includes(this.attributes.newCard.selectedBoard)) {
      this.handler.state = states.NEWCARD.LISTSELECT;
      this.emitWithState('ListSelect');
    }
    else {
      this.response.speak(this.attributes.newCard.selectedBoard + ' is not one of your boards.');
      this.emit('BoardSelect');
    }
  },

  'AMAZON.HelpIntent': function () {
    this.emit('BoardOptionsIntent');
  },

  'AMAZON.StopIntent': function () {
    this.emit('AMAZON.StopIntent');
  },

  'AMAZON.CancelIntent': function () {

  }

});

var listSelectHandlers = Alexa.CreateStateHandler(states.NEWCARD.LISTSELECT, {

  'ListSelect': function () {
    this.response.speak('Which list would you like to create a card on?');
    this.response.listen('Say the name of one of your lists followed by, \"list\".\
    I can also list the names of your lists.');
    this.emit(':responseReady');
  },

  'ListOptionsIntent': function () {
    //calls Trello API to list the user's lists on the selected board

    //add list of lists to response
    this.response.speak('Your lists are: ');
    for (var list in userLists) {
      this.response.speak(list);
    }

    this.emit('ListSelect');
  },

  'ListSelectedIntent': function () {
    this.attributes.newCard.selectedList = this.event.request.intent.slots.list_name.value;

    //check if given option is one of the user's list on the selected board
    if (userLists.includes(this.attributes.newCard.selectedList)) {
      this.handler.state = states.NEWCARD.CREATE;
      this.emitWithState('GetTitle');
    }
    else {
      this.response.speak(this.attributes.newCard.selectedList + ' is not one of your lists on your ' +
      this.attributes.newCard.selectedBoard + ' board.');
      this.emit('ListSelect');
    }
  },

  'AMAZON.HelpIntent': function () {
    this.emit('ListOptionsIntent');
  },

  'AMAZON.StopIntent': function () {
    this.emit('AMAZON.StopIntent');
  },

  'AMAZON.CancelIntent': function () {

  }

});

var createHandlers = Alexa.CreateStateHandler(states.NEWCARD.CREATE, {

  'GetTitle': function () {
    this.emit(':ask', 'What is the title of the new card?', 'Append your title with: The title is ');
  },

  'AdditionalCardFeaturesIntent': function () {
    this.attributes.newCard.title = this.event.request.intent.slots.title.value;

    var newCardHas = {
      'description': (this.attributes.newCard.description !== '' ? true : false),
      'label': (this.attributes.newCard.label !== '' ? true : false),
      'checklist': (this.attributes.newCard.checklist.length !== 0 ? true : false),
      'dueDate': (this.attributes.newCard.dueDate !== null ? true : false)
    };
    if (function () {
      var newCardEmpty = true;
      for (var key in newCardHas) {
        if (key) {
          newCardEmpty = false;
        }
      }
      return newCardEmpty;
    }) {
      this.response.speak('Would you like to add a');
      if (!newCardHas.description) {
        this.response.speak(' description,');
      }
      if (!newCardHas.label) {
        if (newCardHas.checklist && newCardHas.dueDate && !newCardHas.description) {
          this.response.speak(' or');
        }
        this.response.speak(' label,');
      }
      if (!newCardHas.checklist) {
        if (newCardHas.dueDate && (!newCardHas.description || !newCardHas.label)) {
          this.response.speak(' or');
        }
        this.response.speak(' checklist,');
      }
      if (!newCardHas.dueDate) {
        if (!newCardHas.description || !newCardHas.label || !newCardHas.checklist) {
          this.response.speak(' or');
        }
        this.response.speak(' due date');
      }
      this.response.speak('?');
      this.response.listen('Please say no, description, label, checklist, or duedate');
    }
    else {
      this.emit('AMAZON.NoIntent');
    }
  },

  'AskDescriptionIntent': function () {
    this.emit(':ask', 'What\'s the description?', 'What is the description for the new card?');
  },

  'ReceivedDescriptionIntent': function () {
    this.attributes.newCard.description = this.event.request.intent.slots.description.value;

    this.emit('AdditionalCardFeaturesIntent');
  },

  'AskLabelIntent': function () {
    this.response.speak('What label would you like to add to the card?');
    this.response.listen('I can also list labels from your board.');
    this.emit(':responseReady');
  },

  'LabelOptionsIntent': function () {
    //Get labels from board

    this.response.speak('Labels on your ' + this.attributes.newCard.board + ' are: ');
    for (var label in boardLabels) {
      this.response.speak(label + ' ');
    }

    this.emit('AskLabelIntent');
  },

  'ReceivedLabelIntent': function () {
    //TODO: add multiple labels to the new card

    this.attributes.newCard.label = this.event.request.intent.slots.label.value;

    this.emit('AdditionalCardFeaturesIntent');
  },

  'AskChecklistIntent': function () {
    this.response.speak('What are the checklist items? Please say, \"next item\", between each item.');
    this.response.listen('What are the checklist items for the new card? Please say \"next item\" between each item.');
    this.emit(':responseReady');
  },

  'ReceivedChecklistIntent': function () {
    this.attributes.newCard.checklist = this.event.request.intent.slots.checklist_list.value.split(" next item ");

    this.emit('AdditionalCardFeaturesIntent');
  },

  'AskDueDateIntent': function () {
    this.response.speak('What is the due date for the card?');
    this.response.listent('What is the due date for the new card?');
    this.emit(':responseReady');
  },

  'ReceivedDueDateIntent': function () {
    this.attributes.newCard.dueDate = new Date(this.event.request.intent.slots.due_date.value);

    this.emit('AdditionalCardFeaturesIntent');
  },

  'AMAZON.NoIntent': function () {
    //Send new card to Trello

    this.emit(':tell', 'Card Added! Thank you for using Voice for Trello!');
  },

  'AMAZON.HelpIntent': function () {
    this.emit('ListOptionsIntent');
  },

  'AMAZON.StopIntent': function () {
    this.emit('AMAZON.StopIntent');
  },

  'AMAZON.CancelIntent': function () {

  }

});
