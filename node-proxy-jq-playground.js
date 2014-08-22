var http = require('http'),
    url = require('url'),
    iconv = require('iconv').Iconv,
    jsdom = require('jsdom'),
    fs = require('fs'),
    port = 8088;

http.createServer(function(req, res) {

  var x = url.parse(req.url);  

  // 取り急ぎgzipしないように設定
  req.headers['accept-encoding'] = '';

  var opt = {
    host: x.hostname,
    port: x.port || 80,
    method: req.method,
    path: x.path,
    headers: req.headers
  };  

  var isHtml = new String(req.headers['accept']).indexOf('text/html') > -1;
  var isGzip = new String(req.headers['accept-encoding']).indexOf('gzip') > -1;
  
  var proxyReq;
  var buffer = [];
  var bodyLen = 0;

  /* htmlを取得するリクエストの場合 */
  if ( isHtml ) {    
    proxyReq = http.request(opt, function(proxyRes) {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);

      // データ受信中の処理
      proxyRes.on('data', function(chunk) {
        buffer.push(chunk);      
        bodyLen += chunk.length;
      });

      // データ受信終了時の処理
      proxyRes.on('end', function() {
        
        if ( buffer.length ) {
          var _buf = new Buffer(bodyLen);
          var i = 0;
          buffer.forEach(function (chunk) {
            chunk.copy(_buf, i, 0, chunk.length);
            i += chunk.length;
          });

          var bin = _buf.toString('binary');
          var cap = bin.match(/<(meta|META)\b[^>]*charset=["']?([-\w]+)/i);
          var charset = (cap !== null) ? cap[2] : 'utf-8';          
          
          /* utf-8以外の場合、utf-8へ変換 */          
          if (charset != 'utf-8') {
            _buf = new Buffer(_buf, 'binary');
            var xx2utf8 = new iconv(charset, 'utf-8//TRANSLIT//IGNORE');
            _buf = xx2utf8.convert(_buf);
          }

          var html = _buf.toString('utf-8');

          jsdom.env({
            html: html,
            scripts: ['http://code.jquery.com/jquery-2.1.1.js'],
            done: function(errors, window) {
              var $ = window.$;

              // ここで色々できる
              $('div').css('background-color', '#f00');

              res.end(jsdom.serializeDocument2Binary(window.document));
            }
          });

        } else {
          res.end();  
        }
      });
    });

  } else {
    /* html以外を取得するリクエストの場合は中継のみ */
    proxyReq = http.request(opt, function(proxyRes) {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      // レスポンスをそのままサーバへ中継する
      proxyRes.pipe(res);
    }); 
  }
  
  /* リクエストはそのままサーバへ中継する */
  req.pipe(proxyReq);

  proxyReq.on('error', function(e) {
    console.log('EEEEEEE Something happened on Proxy: ', e.message, 'EEEEEEE');
  });

}).listen(port);

console.log('Server running at localhost:' + port + '/');