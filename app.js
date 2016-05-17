// Init modules
var fs = require("fs");
var http = require("http")
var mysql = require("mysql")
var moment = require('moment');
var express = require("express");
var chokidar = require('chokidar');
var compress = require('compression');
var schedule = require('node-schedule');
var bodyParser = require("body-parser");
var WebSocketServer = require("ws").Server

// Express is up
var app = express();

// Websocket follow
var server = http.createServer(app)
var wss = new WebSocketServer({server: server})
var currentWatcher;

// Moment with date locale in Fr
moment.locale('fr');

// Config
var config = app.locals.config = require('./config/config.json');

// Functions
var func = {} // Later defined
app.locals.func = func;

// Compress assets using GZip
app.use(compress());  

// Serve public dir with cache activated
app.use(express.static("static", {
    maxage: "365d"
}))

// Use Pug as template
app.set('view engine', 'pug');
app.set('views', 'views');

// Parse JSON in POST requests
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// MySQL init
var coMysql = mysql.createConnection({
  host : config.MYSQL.HOST,
  user : config.MYSQL.USER,
  password : config.MYSQL.PASSWORD,
  database : config.MYSQL.DB
});
coMysql.connect(function(err) {
  if (err)
    console.error("Erreur lors de la connexion à la base MYSQL.");
});

// Define routes
app
.get('/', function (req, res) {
  func.getActus(function(actus) {
    res.render('index', { 
      ajax: req.query.ajax,
      actus : actus
    });
  });
})
.get('/grille-des-programmes', function (req, res) {
  res.render('grille-des-programmes', { 
    ajax: req.query.ajax
  });
})
.get('/podcasts', function (req, res) {
  func.getPodcasts(function(podcasts) {
    res.render('podcasts', { 
      ajax: req.query.ajax, 
      podcasts: podcasts
    });
  });
})
.get('/a-propos', function (req, res) {
  res.render('a-propos', { 
    ajax: req.query.ajax 
  });
})
.post('/get-programmation', function (req, res) {
    if (req.body.action == "around")
      func.getAroundProg(req, res);
    else if (req.body.action == "forWeek")
      func.getProg(req, res);
    else 
      res.sendStatus(400);
})
.all('*', function(req, res){
    // If no route catch up -> 404
    res.render('404');
});

// Prepare the changing prog file
schedule.scheduleJob('58 23 * * *', function(){
    console.log('Changing watcher');
    var file = func.getCurrentProgFile("tomorrow");
    currentWatcher = func.addWatcher(file);
});

// On first co, send the prog
// On request, refresh prog
wss.on('connection', function (ws) {
  var f = function() {
    func.getLastProg(function(progs) {
      ws.send(progs);
    });
  };
  f();
  ws.on('message', function (message) {
    f();
  });
});

// Launch the server
server.listen(config.PORT, function () {
  console.log(config.SITE.TITLE + " listening on port : " + config.PORT);
});

// Functions
func.getPodcasts = function (cb) {
  var beautifulNames = [];
  var file = config.LINKNAMES_FILE;
  fs.readFile(file, 'utf-8', function(err, data) {
    var lines = data.trim().split("\n");
    for (line of lines) {
      var originalName = line.split(":")[0];
      var beautifulName = line.split(":")[1];
      beautifulNames[originalName] = beautifulName;
    };
    var podcasts = [];
    fs.readdir(config.PODCAST.FOLDER, function(err, files) {
      files.forEach(function (file) {
        if (file.substr(-4) == ".mp3") {
          var date = file.split("_")[0]; 
          var category = file.split("_")[1]; 
          var podcast = {};
          podcast.file = config.PODCAST.URL + file;
          podcast.date = moment(date, "YYYYMMDD").format("Do MMMM YYYY");
          podcast.originalCategory = category;
          podcast.category = beautifulNames[category] || category;
          podcasts.push(podcast);
        } 
      });
      cb(podcasts);
    });
  });
}
func.getLastProg = function (cb) {
  fs.readFile(func.getCurrentProgFile(), 'utf-8', function(err, data) {
      if (err) {
        res.sendStatus(500);
        return;
      }
      var lines = data.trim().split("\n");
      var progs = lines.slice(-5).reverse();
      var response = { "type": "progChanged" };
      response.progs = progs;
      cb(JSON.stringify(response))
  });
}
func.getProg = function (req, res) {
  var progs = [];
  file = config.PROG_FOLDER + "default_prog.csv";
  fs.readFile(file, 'utf-8', function(err, data) {
      if (err) {
        res.sendStatus(500);
        return;
      }
      var lines = data.trim().split("\n");
      for (line of lines) {
        line = line.split(";");
        var prog = {};
        prog.day = line[0];
        prog.hour = line[1];
        prog.duration = line[2];
        prog.name = line[3];
        prog.details = line[4];
        prog.podcastLink = line[5];
        prog.link = line[6];
        prog.cover = line[7];
        progs.push(prog);
      };
      res.send(progs);
  });
}
func.getActus = function(cb) {
  //var query = SELECT title, startDate, endDate, content, author, status, ordre FROM posts WHERE CURDATE()<= ADDDATE(endDate,6) ORDER BY ordre ASC LIMIT 10
  var query = 'SELECT title, startDate, endDate, content, author, status FROM posts';
  var actus = [];
  coMysql.query(query, function (error, results, fields) {
    if (error)
      return;
    for (var i in results){
      var actu = {};
      actu.title = results[i].title;
      actu.startDate = results[i].startDate;
      actu.endDate = results[i].endDate;
      actu.content = results[i].content;
      actu.author = results[i].author;
      actu.status = results[i].status;
      //actu.ordre = results[i].ordre;
      actus.push(actu);   
    }
    cb(actus);
  });
}
func.getAroundProg = function (req, res) {
  var date = req.body.date;
  var hour = req.body.hour;
  if (!date || !hour) res.sendStatus(400);
  else {
    var file = moment(date, "DD/MM").format("YYYY-MM-DD");
    file += "_airplay.log";
    file = config.AIRPLAY_FOLDER + file;
    fs.readFile(file, 'utf-8', function(err, data) {
        if (err) {
          res.sendStatus(404);
          return;
        }
        var gap = 7;
        var h = moment(hour, "HH:mm");
        var numberSearchMin = moment(h).subtract(gap, "minutes").format("HHmm");
        var numberSearchMax = moment(h).add(gap, "minutes").format("HHmm");
        var results = [];
        var lines = data.trim().split("\n");
        lines.forEach(function (line) {
          var numberHour = line.split(" ")[0].slice(0,5).replace(":","");
          if (numberHour > numberSearchMin && numberHour < numberSearchMax)
              results.push(line);
        });
        res.send(JSON.stringify(results));  
    });
  }
},
func.returnRelativeDate = function(i) {
  if (!i) 
    var i = 0;
  var date = moment().subtract(i, "days").format("DD/MM");
  var humanDate = moment().subtract(i, "days").format("dddd Do MMMM");
  return [date, humanDate];
}
func.getCurrentProgFile = function (when) {
  var file = moment();
  if (when == "tomorrow")
    file.add(1, "days");
  file = file.format("YYYY-MM-DD");
  file += "_airplay.log";
  return config.AIRPLAY_FOLDER + file;
}
func.addWatcher = function (file) {
  if(currentWatcher)
    currentWatcher.close();
  currentWatcher = chokidar.watch(file).on('change', function (event, path) {
    func.getLastProg(function(progs) {
      wss.clients.forEach(function each(client) {
            client.send(progs);
      });
    });
  });
}

// This var can now be defined
currentWatcher = func.addWatcher(func.getCurrentProgFile());