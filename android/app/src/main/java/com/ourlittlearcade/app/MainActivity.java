package com.ourlittlearcade.app;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import android.os.Build;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.media.AudioAttributes;
import android.net.Uri;

public class MainActivity extends BridgeActivity {
  @Override public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      String[] sounds={"sweet_bell","little_sparkle","soft_hearts"};
      String[] names={"Sweet Bell","Little Sparkle","Soft Hearts"};
      NotificationManager manager=getSystemService(NotificationManager.class);
      for(int i=0;i<sounds.length;i++) {
        NotificationChannel channel=new NotificationChannel("little-"+sounds[i]+"-v1",names[i],NotificationManager.IMPORTANCE_HIGH);
        channel.setSound(Uri.parse("android.resource://"+getPackageName()+"/raw/"+sounds[i]),new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
        channel.enableVibration(true);
        manager.createNotificationChannel(channel);
      }
    }
  }
}
