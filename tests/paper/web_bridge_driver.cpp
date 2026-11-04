#include <iostream>
#include <string>
extern "C" const char *paper_call(int,int,double,double,double,double,double,double,const char*,int);
int main() {
  // One command per line: op id u v x y z dt flags. Snapshots are tested in JS.
  int op,id,flags; double u,v,x,y,z,dt;
  while(std::cin>>op>>id>>u>>v>>x>>y>>z>>dt>>flags)
    std::cout<<paper_call(op,id,u,v,x,y,z,dt,"",flags)<<'\n';
}
