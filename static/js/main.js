"use strict";

// Foundation init
$(document).foundation();

// Dynamic colors
var insertAt = 0;
function setDynamicColors(nb) {
  if(!nb) {
    nb = moment().format("DDD");
  }
  if (nb > 360)
    nb = 360;
  // TO REMOVE FORCE VALUE
  //nb = 240;
  var tint = (240 - nb) % 360;
  var color = "hsl(" + tint + ", 80%, 75%)"; //*8%, 75%
  var colorActive = "hsl(" + tint + ", 35%, 50%)";
  var colorHover = "hsl(" + tint + ", 7%, 80%)";
  var colorHover_button = "hsl(" + tint + ", 10%, 90%)";
  //var rule = "aside .button { background-color: " + color + "}" 
  //var rule =  "aside a.button, .title-bar, .badge, { border: solid 1px; border-color: " + color + "}";
  // /!\ ONLY ONE RULE AT A TIME BECAUSE insertRule function is GODDAMN STUPID /!\
  var rule = "aside a.button {background-color: rgba(205,205,205,0.7);}";
  var ruleActive = "aside a.button.active { border:solid 1px; border-color: " + color + "}";
  var ruleHover = "aside a.button:hover { border:solid 1px; border-color: " + colorHover + "; background-color:" + colorHover_button + ";}"; 
  var ruleHover2 = ".thumbnail:hover { box-shadow: 0 0 6px 1px " + colorHover_button + "}";
  var ruleProgressBar = "#nprogress .bar { background: " + color + " !important}";
  var rule_links = "#content a {background-color : " + colorHover_button + "; color: " + colorHover + "}";
  var rule_links_pseudo = "#content a:focus, #content a:hover";
  var sheet = window.document.styleSheets[1];
  console.log(sheet);
  if (insertAt) // Permit refresh in browser when calling func
    for(var i = 0; i<6; i++)
      sheet.deleteRule(insertAt);
  insertAt = sheet.cssRules.length;
  sheet.insertRule(rule, insertAt);
  sheet.insertRule(ruleActive, insertAt);
  sheet.insertRule(ruleHover, insertAt);
  sheet.insertRule(ruleHover2, insertAt);
  sheet.insertRule(ruleProgressBar, insertAt);
  sheet.insertRule(rule_links, insertAt);
}
setDynamicColors();

// Ajax load of pages
NProgress.configure({ showSpinner: false });
$("aside a").click(function(event) {
  NProgress.start();
  event.preventDefault();
  var link = $(this).attr("href");
  var linkAjax = link + "?ajax=true";
  var title = $(this).text();
  var newTitle = document.title.split("|")[0] + "| " + title;
  NProgress.set(0.4);
  $.get(linkAjax, function(html) {
      NProgress.set(0.6);
      $("#content").html(html);
      window.history.pushState({"pageTitle": newTitle, "html": html}, "", link);
      refreshActivePageInMenu();
      NProgress.done();
      $('.title-bar').foundation('toggleMenu');
  });
});
window.onpopstate = function(e){
  if(e.state){
    document.getElementById("content").innerHTML = e.state.html;
    document.title = e.state.pageTitle;
  }
};

// Set menu active button
function refreshActivePageInMenu() {
  var activePage = window.location.pathname;
  $("aside a.button").removeClass("active");
  var selector = "aside a.button[href='" + activePage +"']";
  $(selector).addClass("active");
}
refreshActivePageInMenu();

// Set defaults select options in menu
var selector = "#searchDate option[value='" + moment().format("DD/MM") + "']";
$(selector).attr("selected", "selected").text("Aujourd'hui");
selector = "#searchDate option[value='" + moment().subtract(1, "days").format("DD/MM") + "']";
$(selector).text("Hier");
selector = "#searchDate option[value='" + moment().subtract(2, "days").format("DD/MM") + "']";
$(selector).text("Avant-hier");
selector = "#searchHour option[value^='" + moment().format("HH") + "']";
$(selector).first().attr("selected", "selected");


// Search
$("#search").click(function(event) {
  $("#searchResults").html("");
  $("#searchResultsIntro").addClass("hide");
  $.ajax({
    method: "POST",
    url: "/get-programmation",
    dataType: "json",
    data : {
      "action" : "around",
      "date" : $("#searchDate").val(),
      "hour" : $("#searchHour").val()
    }
  }).done(function(progs) {
    $("#searchResultsIntro").removeClass("hide");
    $("#search").addClass("active");
    var html = "";
    $.each(progs, function(i, prog) {
      prog = removeSecFromProg(prog);
      html += "<li>" + prog + "</li>";
    });
    $("#searchResults").html(html);
  }).fail(function(data) {
    $("#searchResults").text("Historique introuvable, désolé.");
  });
});

// Player
var activeSong = document.getElementById("audio");
function makePlay (state) {
  if (state) {
    activeSong.play();
    $("#progress").show();
    $("#player #playPause").attr("src", "/img/pause.png");
  } else {
    activeSong.pause();
    $("#progress").hide();
    $("#player #playPause").attr("src", "/img/play.svg");
  }
}
$("#playPause").click(function(event) {
  if(activeSong.paused)
    makePlay(true);
  else
    makePlay(false);
});
$("#audio").bind('timeupdate', function() {
  if (!live()) {
    var percentageOfSong = (activeSong.currentTime/activeSong.duration);
    var currentTime = formatSecondsAsTime(activeSong.currentTime)
    var duration = formatSecondsAsTime(activeSong.duration)
    $("#progressText").text(currentTime + "/" + duration);
    $("#progress").attr("value", percentageOfSong);
  }
});
$("#progress").click(function(event) {
  if(!live()) {
    var percent = event.offsetX / this.offsetWidth;
    activeSong.currentTime = percent * activeSong.duration;
  }
});
function live() {
  if (isFinite(activeSong.duration))
    return false;
  return true;
}

//Player Menu
function returnToLive () {
  $('#playerMenu').foundation("close");
  var streamLive = $("#audio source").data("streamurl");
  activeSong.src = streamLive;
  $("#player #title").text("Chargement...")
  $("#progress").removeAttr("value");
  $("#progressText").html("<span class='badge'>Live</span>");
  activeSong.load();
  makePlay(true);
  ws.send("refresh")
};
$("#returnToLive").click(function(event) {
  returnToLive();
});
$("#getStream").click(function(event) {
   var stream = $("#audio source").attr("src");
   window.location.href= stream;
});
// On any error, reload live
$("#audio").on("error", function (e) {
  returnToLive();
});

// Podcasts
// Delegate the event to the main container
$("#content").on("click", ".podcast .thumbnail", function () {
   activeSong = document.getElementById("audio");
   activeSong.src = $(this).data("file");
   $("#player #title").text($(this).data("title"));
   updateCover("setDefault");
   activeSong.load();
   activeSong.play();
   makePlay(true);
});

// Prevent drag img
$("img").mousedown( function(e) { e.preventDefault() } ); // fix for IE

// Utils Functions
function formatSecondsAsTime(secs) {
  return moment("0000", "HHmm").add(secs, "seconds").format("mm:ss");
}
function removeSecFromProg(s) {
  return s.slice(0,5) + s.slice(8);
}

// Websocket
var host = location.origin.replace(/^http/, 'ws')
var ws = new WebSocket(host);
ws.onmessage = function (event) {
  var data = JSON.parse(event.data);
  var html = "";
  $.each(data.progs, function(i, prog) {
    prog = removeSecFromProg(prog);
    if(i==0) {
      if(live()) {
        $("#player #title").text(prog.slice(6));
        updateCover();
      }
      prog = "<b>" + prog + "</b>";
    }
    html += "<li>" + prog + "</li>";
  });
  $("#lastFive").html(html);
};
$(window).on('beforeunload', function(){
  activeSong.pause();
  activeSong.parentElement.removeChild(activeSong);
  ws.close();
});
function updateCover(action) {
  if (action === "setDefault") {
    $("#cover").attr("src", "/img/logo.png");
  } else {
    var text = $("#player #title").text();
    $.ajax({
      method: "GET",
      url: "http://ws.audioscrobbler.com/2.0/",
      data : {
        "method" : "track.search",
        "track" : text,
        "api_key": window.apiKey,
        "format": "json"
      }
    }).always(function(json) {
      if(typeof json.results.trackmatches.track[0] != "undefined") {
        var url = json.results.trackmatches.track[0].image[1]["#text"];
        $("#cover").attr("src", url);
      }
      else
        updateCover("setDefault");
    });
  }
}
