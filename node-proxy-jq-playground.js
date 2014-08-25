var http = require('http'),
    url = require('url'),
    iconv = require('iconv').Iconv,
    jsdom = require('jsdom'),
    zlib = require('zlib'),
    port = 8088;

http.createServer(function(req, res) {
  var x = url.parse(req.url);
  var opt = {
    host: x.hostname,
    port: x.port || 80,
    method: req.method,
    path: x.path,
    headers: req.headers
  };  

  var isHtml = new String(req.headers['accept']).indexOf('text/html') > -1;
  
  var proxyReq, inRes, outRes;
  var buffer = [];
  var bodyLen = 0;

  /* htmlを取得するリクエストの場合はレスポンスを加工できるようにする */
  if ( isHtml ) {    
    proxyReq = http.request(opt, function(proxyRes) {
      var encoding = proxyRes.headers['content-encoding'];

      switch ( encoding ) {
        case 'gzip':
          inRes = zlib.createGunzip();
          proxyRes.pipe(inRes);
          break;
        case 'deflate':
          inRes = zlib.createInflate();
          proxyRes.pipe(inRes);
          break;
        default:
          inRes = proxyRes;
          break;
      }

      /* 分割されて受け取ったデータは一旦格納し、最後に連結 */
      inRes.on('data', function(chunk) {
        buffer.push(chunk);      
        bodyLen += chunk.length;
      });

      /* 受信終了時にすべて処理する */
      inRes.on('end', function() {

        if ( buffer.length ) {
          /* すべてのChunkを結合 */
          var _buf = new Buffer(bodyLen);
          var i = 0;
          buffer.forEach(function (chunk) {
            chunk.copy(_buf, i, 0, chunk.length);
            i += chunk.length;
          });
          
          /* metaタグから文字コードを取得（一度utf-8に変換して遊ぶ） */
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
            done: function (errors, window) {

              /* Here is the playground. */
              (function (window, document, $) {

                /* ここで色々できる */
                $('div').css('background-color', '#f00');

              }(window, window.document, window.jQuery));
              
              /* クライアントに返す処理 */
              switch ( encoding ) {
                case 'gzip':
                  outRes = zlib.createGzip();
                  outRes.pipe(res);
                  break;
                case 'deflate':
                  outRes = zlib.createDeflate();
                  outRes.pipe(res);
                  break;
                default:
                  outRes = res;                  
                  break;
              }
              _buf = jsdom.serializeDocument2Binary(window.document);

              /* 変更後のresponseでcontent-lengthを更新してからヘッダを書き込む */
              proxyRes.headers['content-length'] = _buf.length;
              res.writeHead(proxyRes.statusCode, proxyRes.headers);

              outRes.end(_buf);
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