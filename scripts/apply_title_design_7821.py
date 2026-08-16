from pathlib import Path

path = Path('app/screen-isolation.css')
css = path.read_text()
marker = '/* 7.8.21 distinct app and media title hierarchy */'
if marker in css:
    print('Title hierarchy already applied')
    raise SystemExit(0)

css += r'''

/* 7.8.21 distinct app and media title hierarchy */
html body .app-shell.app-shell.app-shell:not(.viewer) .home-intro h1{
  max-width:860px!important;
  margin-top:5px!important;
  background:linear-gradient(100deg,#f4f2ff 0%,#c9c2ff 34%,#9f97f7 57%,#72cde6 100%)!important;
  -webkit-background-clip:text!important;
  background-clip:text!important;
  -webkit-text-fill-color:transparent!important;
  color:transparent!important;
  font-size:clamp(30px,3.2vw,39px)!important;
  font-weight:760!important;
  line-height:1.08!important;
  letter-spacing:-.042em!important;
  text-wrap:balance;
}
html body .app-shell.app-shell.app-shell:not(.viewer) .home-intro h1:after{
  width:54px!important;
  height:3px!important;
  margin-top:13px!important;
  border-radius:999px!important;
  background:linear-gradient(90deg,#8174ef,#6fa9ee 55%,#65d3df)!important;
  box-shadow:0 0 20px rgba(119,119,240,.2)!important;
}

html:not([data-theme="light"]) body .viewer.viewer.viewer .player-greek-title{
  position:relative!important;
  max-width:880px!important;
  margin-top:7px!important;
  padding-left:15px!important;
  background:linear-gradient(104deg,#ffffff 0%,#f2f1ff 52%,#c3bfff 82%,#a69cf6 100%)!important;
  -webkit-background-clip:text!important;
  background-clip:text!important;
  -webkit-text-fill-color:transparent!important;
  color:transparent!important;
  font-size:25px!important;
  font-weight:735!important;
  line-height:1.17!important;
  letter-spacing:-.032em!important;
  text-wrap:balance;
}
html:not([data-theme="light"]) body .viewer.viewer.viewer .player-greek-title:before{
  content:"";
  position:absolute;
  left:0;
  top:.14em;
  bottom:.12em;
  width:3px;
  border-radius:999px;
  background:linear-gradient(180deg,#8c7cf6 0%,#716fe9 48%,#55c3dd 100%);
  box-shadow:0 0 14px rgba(125,111,238,.25);
}

html[data-theme="light"] body .app-shell.app-shell.app-shell:not(.viewer) .home-intro h1{
  background:linear-gradient(100deg,#10293a 0%,#315b75 40%,#6257b7 72%,#338fa7 100%)!important;
  -webkit-background-clip:text!important;
  background-clip:text!important;
  -webkit-text-fill-color:transparent!important;
  color:transparent!important;
}
html[data-theme="light"] body .viewer.viewer.viewer .player-greek-title{
  position:relative!important;
  max-width:880px!important;
  margin-top:7px!important;
  padding-left:15px!important;
  background:linear-gradient(104deg,#142638 0%,#29465f 58%,#6256b4 100%)!important;
  -webkit-background-clip:text!important;
  background-clip:text!important;
  -webkit-text-fill-color:transparent!important;
  color:transparent!important;
  font-size:25px!important;
  font-weight:735!important;
  line-height:1.17!important;
  letter-spacing:-.032em!important;
  text-wrap:balance;
}
html[data-theme="light"] body .viewer.viewer.viewer .player-greek-title:before{
  content:"";
  position:absolute;
  left:0;
  top:.14em;
  bottom:.12em;
  width:3px;
  border-radius:999px;
  background:linear-gradient(180deg,#7063d2 0%,#508ab7 55%,#45aec1 100%);
}

@media(max-width:620px){
  html body .app-shell.app-shell.app-shell:not(.viewer) .home-intro h1{
    max-width:360px!important;
    font-size:clamp(27px,8.1vw,32px)!important;
    line-height:1.08!important;
    letter-spacing:-.038em!important;
  }
  html body .viewer.viewer.viewer .player-greek-title{
    max-width:100%!important;
    padding-left:12px!important;
    font-size:22px!important;
    line-height:1.2!important;
    letter-spacing:-.029em!important;
  }
  html body .viewer.viewer.viewer .player-greek-title:before{
    width:2px;
  }
}
'''
path.write_text(css)
print('Applied distinct 7.8.21 title hierarchy')
