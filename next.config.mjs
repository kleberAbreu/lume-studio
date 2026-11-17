export default {
  basePath:'/img_editor',
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {cpus:1, webpackBuildWorker:false},
  async headers(){
    return [{source:'/:path*',headers:[
      {key:'Cache-Control',value:'private, no-store'},
      {key:'X-Content-Type-Options',value:'nosniff'},
      {key:'Referrer-Policy',value:'same-origin'}
    ]}];
  }
};
