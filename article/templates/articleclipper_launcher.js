(function(){
  if(!window.articleclipper) {
    articleclipper_js = document.body.appendChild(document.createElement('script'));
    articleclipper_js.src = '//ctbbj.marianstreet.tokyo/static/js/articleclipper2.js?r='+Math.floor(Math.random()*9999999999999999);
    window.articleclipper = true;
  }
  else {
    articleclipperLaunch2();
  }
})();
