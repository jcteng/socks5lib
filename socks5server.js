const {Socks5,Socks5UDP} = require("./lib/socks5")
const net = require("net")
const dgram = require('dgram')

function Sock5BindServer(destIP,destPort,cb){
    const srv = net.createServer((socket) => {
        var agentSocket =new net.Socket()
        agentSocket.connect(destPort,destIP)
        agentSocket.on("connect",()=>{
            socket.pipe(agentSocket).pipe(socket)
        })
    })
    srv.listen(0,function(){
        cb(srv.address())
    });
    this.close = ()=>{
        srv.close()
    }
}
function tcponnect(socket,socks5,dstAddr,dstPort){
    console.log("connect>%s:%d",dstAddr,dstPort)
    socket.pause()                
    let agentSocket = new net.Socket()
    agentSocket.connect(dstPort,dstAddr)
    agentSocket.on("connect",()=>{
        //send last ack then unpipe it
        socks5.Success(agentSocket.localAddress,agentSocket.localPort)
        socket.unpipe(socks5).unpipe(socket)
        //pipe to target sockets
        socket.pipe(agentSocket).pipe(socket)
        socket.resume()
        agentSocket.on("close",()=>{
            socket.end()
        })
    })                
    //you can deal with close event and socket error handle
    agentSocket.on("error",()=>{
        socks5.Failed(socks5.REPLY.GENFAIL)
        socket.resume()
        socket.end()                    
    })
    socket.on("close",()=>{
        agentSocket.end()
    })
}

function tcpbind(socket,socks5,addr,port){
    var srvBinded = new Sock5BindServer(addr,port,(binded)=>{
        socks5.Success(binded.address,binded.port)
        console.log("bind>%s:%d <->%s:%d",addr,port,binded.address,binded.port)
    })    
    socket.on("close",()=>{
        srvBinded.close()//hold the sock until bind server close
    })
}
function udpassociate(socket,socks5,addr,port){
    var brokerSocket = dgram.createSocket("udp4")
    var udpAgentSocket = dgram.createSocket("udp4")
    var socks5udp = new Socks5UDP()
    var clientAddr = {address:addr,port:port}
    brokerSocket.on("listening",()=>{
        let address = brokerSocket.address();
        console.log("udp associated>%s:%d <->%s:%d",addr,port,address.address,address.port)
        socks5.Success(address.address,address.port)
    })
    brokerSocket.on("message",(mesg,info)=>{
        if(port==0){ //accept 1st arrived as target 
            clientAddr = info                    
        }                    
        socks5udp.UDP_unpack(mesg,(data,address,port)=>{                    
            udpAgentSocket.send(data,port,address)
        })
    })
    udpAgentSocket.on("message",(mesg,info)=>{
        socks5udp.UDP_pack(mesg,info,(data)=>{
            brokerSocket.send(data,clientAddr.port,clientAddr.address)
        })
    })
    socket.on("close",()=>{
        brokerSocket.close()
        udpAgentSocket.close()        
    })
    brokerSocket.bind(0)
}
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
                tcponnect(socket,socks5,addr,port);
                break;
            case socks5.CMD.BIND:
                tcpbind(socket,socks5,addr,port);
                break;                
            case socks5.CMD.UDPASSOCIATE:
                udpassociate(socket,socks5,addr,port);
                break;
        }
    })
})
server.listen(8080,"127.0.0.1",function(){
    console.log('server on socks5://%s:%d', server.address().address,server.address().port);
});
server.on("error",(err)=>{
    console.log("server error %s",err.message)
})