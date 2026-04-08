#import <Capacitor/Capacitor.h>

CAP_PLUGIN(CornerPOSHttpServerPlugin, "CornerPOSHttpServer",
    CAP_PLUGIN_METHOD(start, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(stop, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(respond, CAPPluginReturnNone);
)
