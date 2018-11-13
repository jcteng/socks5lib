# socks5lib

socks5lib is a stream based socks5 parser to speedup socks5 server and tunel development.

## Features

1. Only support NOAUTH mode. In most time ,socks5 used as tunnel's local broker. No authentication required for those cases.

2. Support all rfc defined commands. Include Connect/BIND/UDP ASSOCICATE

3. UDP library support fragment.

## How to install

    npm install socks5lib

Or copy socks5.js to your project directly.

## Sample socks5 server

socks5server.js implemented a full feature standard socks5 server ,include BIND/CONNECT/UDP ASSCIOCATE. All proxied tcp/udp will tunnel by local agent. If you use socks5lib to build a tunel server please reference code in socks5server.js.

It lanuch By:

    node socks5server.js

## How to use socks5lib

To use socks5lib needs a tcp server likes below:

    const {Socks5,Socks5UDP} = require("socks5lib")

    const net = require("net")
    const server = net.createServer((socket) => {
        socket.on("error",(err)=>{})
        //pipe socks5 with connection
        socks5 = new Socks5()
        socks5.on('error',(err)=>{
            console.log("socks5 error found",err)
            socket.close()
        })
        socket.pipe(socks5).pipe(socket)
        //listen commands with
        socks5.on("command",(cmd,addr,port,atype)=>{
            switch(cmd){
                case socks5.CMD.CONNECT:
                    console.log("on CONNECT %s:%d",addr,port)
                    break;
                case socks5.CMD.BIND:
                    console.log("on BIND %s:%d",addr,port)
                    break;
                case socks5.CMD.UDPASSOCIATE:
                    console.log("on UDPASSOCIATE %s:%d",addr,port)
                    break;
            }
        })
    })
    server.listen(8080,"127.0.0.1",function(){
        console.log('server on socks5://%s:%d', server.address().address,server.address().port);
    });

## UDP and BIND tcp lifecycle

UDP and BIND do not use TCP server's socket as transport,this socket's lifecycle should match with UDP/BIND agent's. This means , close socket while agent ends.
