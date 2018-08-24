function login(email, password, callback) {
    require('tedious@1.11.0');
    //this example uses the "tedious" library
    //more info here: http://pekim.github.io/tedious/index.html
    var connection = sqlserver.connect({
      userName: 'sancor',
      password: 'Password01!',
      server: 'ec2-34-201-155-123.compute-1.amazonaws.com',
      options: {
        encrypt: true,
        database: 'sancor-san',
        rowCollectionOnRequestCompletion: true
      }
    });
  
    var query = "SELECT Id, Nickname, Email, Password " +
      "FROM dbo.Users WHERE Email = @Email";
      
    connection.on('debug', function (text) {
    }).on('errorMessage', function (text) {
      console.log(JSON.stringify(text, null, 2));
    }).on('infoMessage', function (text) {
      console.log(JSON.stringify(text, null, 2));
    });
  
    connection.on('connect', function (err) {
      if (err) return callback(err);
  
      var request = new sqlserver.Request(query, function (err, rowCount, rows) {
        if (err) {
          callback(new Error(err));
        } else if (rowCount < 1) {
          callback(new WrongUsernameOrPasswordError(email));
        } else {
          if (password.trim() !== rows[0][3].value.trim()) {
              //console.log("Password:", password.trim());
              //console.log("RowfromDB:", rows[0][3].value.trim());
              callback(new WrongUsernameOrPasswordError(email)); 
          }
          else {
              console.log("RowsId:", rows[0][0].value);
              console.log("RowsNick:", rows[0][1].value);
              console.log("RowsEmail:", rows[0][2].value);
              callback(null, {
                user_id: rows[0][0].value,
                nickname: rows[0][1].value,
                email: rows[0][2].value
              });
          }
        }
      });
  
      request.addParameter('Email', sqlserver.Types.VarChar, email);
      connection.execSql(request);
    });
  }
  